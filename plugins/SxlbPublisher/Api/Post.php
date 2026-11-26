<?php

namespace TypechoPlugin\SxlbPublisher\Api;

use Typecho\Config;
use Typecho\Db;
use Typecho\Widget;
use TypechoPlugin\SxlbPublisher\PostEdit;
use Widget\Options;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 文章读写
 *
 * 写操作全部经过 PostEdit（Widget\Contents\Post\Edit 子类），
 * 保证 finishPublish / finishDelete 钩子照常触发。
 */
class Post
{
    /**
     * 与后台一致的 13 个 handsome 字段默认值
     */
    private const DEFAULT_FIELDS = [
        'thumbStyle' => 'default',
        'thumbSmall' => '',
        'thumbDesc' => '',
        'thumbChoice' => 'default',
        'thumb' => '',
        'summary' => '',
        'customSummary' => '',
        'reprint' => 'standard',
        'parseWay' => 'auto',
        'outdatedNotice' => 'no',
        'noThumbInfoStyle' => 'default',
        'noThumbInfoEmoji' => '',
        'mathjax' => 'auto',
    ];

    /**
     * 文章列表
     *
     * @return array{items: array, total: int, page: int, size: int}
     */
    public static function listing(
        Db $db,
        int $page,
        int $size,
        string $status,
        string $keyword = '',
        int $mid = 0
    ): array {
        // scheduled 与 publish 同属 type=post，区别在于 created 是否已到发布时间
        $type = $status === 'draft'
            ? 'post_draft'
            : (in_array($status, ['publish', 'scheduled'], true) ? 'post' : null);
        $now = time();

        $countQuery = $db->select(['COUNT(table.contents.cid)' => 'num'])->from('table.contents');
        // 表别名全限定：分类筛选会 JOIN relationships，cid 等列名会冲突
        $rowsQuery = $db->select(
            ['table.contents.cid' => 'cid'],
            ['table.contents.title' => 'title'],
            ['table.contents.slug' => 'slug'],
            ['table.contents.created' => 'created'],
            ['table.contents.modified' => 'modified'],
            ['table.contents.status' => 'status'],
            ['table.contents.type' => 'type'],
            // order 作为「置顶」标记：> 0 时排在列表最前。
            // 别名不能叫 order（保留字），统一用 pinned
            ['table.contents.order' => 'pinned']
        )
            ->from('table.contents')
            ->order('table.contents.order', Db::SORT_DESC)
            ->order('table.contents.created', Db::SORT_DESC)
            ->page($page, $size);

        self::applyTypeFilter($countQuery, $type);
        self::applyTypeFilter($rowsQuery, $type);

        // 按分类筛选：同一文章在 relationships 里对同一 mid 只有一条记录，COUNT 不会翻倍
        if ($mid > 0) {
            $countQuery->join('table.relationships', 'table.relationships.cid = table.contents.cid')
                ->where('table.relationships.mid = ?', $mid);
            $rowsQuery->join('table.relationships', 'table.relationships.cid = table.contents.cid')
                ->where('table.relationships.mid = ?', $mid);
        }

        $keyword = trim($keyword);

        if ($keyword !== '') {
            // 转义 LIKE 通配符，避免用户输入的 % _ 被当成模式
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $keyword) . '%';
            $countQuery->where('table.contents.title LIKE ?', $like);
            $rowsQuery->where('table.contents.title LIKE ?', $like);
        }

        // 定时发布：Typecho 用 type=post + status=publish + created 在未来表示待发布
        if ($status === 'publish') {
            $countQuery->where('table.contents.created <= ?', $now);
            $rowsQuery->where('table.contents.created <= ?', $now);
        } elseif ($status === 'scheduled') {
            $countQuery->where('table.contents.created > ?', $now);
            $rowsQuery->where('table.contents.created > ?', $now);
        }

        $total = (int) $db->fetchObject($countQuery)->num;
        $items = [];

        foreach ($db->fetchAll($rowsQuery) as $row) {
            $items[] = [
                'cid' => (int) $row['cid'],
                'title' => htmlspecialchars_decode((string) $row['title'], ENT_QUOTES),
                'slug' => (string) $row['slug'],
                'created' => (int) $row['created'],
                'modified' => (int) $row['modified'],
                'status' => $row['type'] === 'post_draft' ? 'draft' : 'publish',
                'scheduled' => $row['type'] === 'post' && (int) $row['created'] > $now,
                'pinned' => (int) $row['pinned'] > 0,
            ];
        }

        return ['items' => $items, 'total' => $total, 'page' => $page, 'size' => $size];
    }

    /**
     * 单篇详情
     */
    public static function detail(Db $db, int $cid): ?array
    {
        $row = $db->fetchRow(
            $db->select()->from('table.contents')
                ->where('table.contents.cid = ?', $cid)
                ->where('table.contents.type = ? OR table.contents.type = ?', 'post', 'post_draft')
                ->limit(1)
        );

        if (!$row) {
            return null;
        }

        $text = (string) $row['text'];
        if (strpos($text, '<!--markdown-->') === 0) {
            $text = substr($text, 15);
        }

        $categories = self::categoryIds($db, $cid);
        $fields = self::fields($db, $cid);

        // 相册分类（slug=image）决定客户端是否显示「相册描述」字段
        $albumCategory = $db->fetchRow(
            $db->select('mid')->from('table.metas')
                ->where('slug = ?', 'image')
                ->where('type = ?', 'category')
                ->limit(1)
        );

        return [
            'cid' => (int) $row['cid'],
            'title' => htmlspecialchars_decode((string) $row['title'], ENT_QUOTES),
            'text' => $text,
            'slug' => (string) $row['slug'],
            'url' => self::permalink($row),
            'created' => (int) $row['created'],
            'modified' => (int) $row['modified'],
            'status' => $row['type'] === 'post_draft' ? 'draft' : 'publish',
            'pinned' => (int) $row['order'] > 0,
            'categories' => $categories,
            'tags' => implode(',', self::tagNames($db, $cid)),
            'fields' => $fields,
            'imagePost' => $albumCategory
                ? in_array((int) $albumCategory['mid'], $categories, true)
                : false,
        ];
    }

    /**
     * 按 Typecho 的永久链接规则生成完整地址
     *
     * 不能直接用 slug 拼接：博客可能配置为 /archives/{cid}/ 或带分类、日期的规则。
     * 草稿返回空串。
     */
    private static function permalink(array $row): string
    {
        if ($row['type'] === 'post_draft') {
            return '';
        }

        /** @var PostEdit $edit */
        $edit = Widget::widget(PostEdit::class, null, ['cid' => (int) $row['cid']]);
        $edit->push($row);

        return (string) $edit->permalink;
    }

    /**
     * 新建或更新文章
     *
     * @param array $in 请求参数
     * @param Config $config 插件配置
     * @return array
     */
    public static function save(array $in, Config $config): array
    {
        $db = Db::get();
        $cid = (int) ($in['cid'] ?? 0);
        $isDraft = !empty($in['isDraft']);
        $title = trim((string) ($in['title'] ?? ''));
        $text = (string) ($in['text'] ?? '');

        if ($text === '') {
            throw new \RuntimeException('正文不能为空');
        }

        if (strpos($text, '<!--markdown-->') !== 0) {
            $text = '<!--markdown-->' . $text;
        }

        $contents = [
            'cid' => $cid,
            'title' => $title !== '' ? $title : '未命名文档',
            'text' => $text,
            // 缩略名统一在服务端兜底：留空自动生成，非法值直接提示，重复自动追加序号
            'slug' => self::normalizeSlug($db, (string) ($in['slug'] ?? ''), $title, $cid),
            'type' => $isDraft ? 'post_draft' : 'post',
            'status' => 'publish',
            // 置顶：order > 0，列表按 order 倒序排在最前
            'order' => !empty($in['pinned']) ? 1 : 0,
            'authorId' => max(1, (int) ($config->authorId ?? 1)),
            'allowComment' => 1,
            'allowPing' => 1,
            'allowFeed' => 1,
        ];

        $created = (int) ($in['created'] ?? 0);
        if ($created > 0) {
            $contents['created'] = $created;
        } elseif ($cid === 0) {
            $contents['created'] = time();
        }

        $categories = $in['mid'] ?? [];

        if (!is_array($categories) || empty($categories)) {
            $fallback = self::defaultCategoryId($db);
            $categories = $fallback > 0 ? [$fallback] : [];
        } else {
            $categories = array_values(array_unique(array_filter(array_map('intval', $categories))));
            // 客户端可能带着已删除的分类 mid 保存，过滤掉不存在的，避免写入孤立关系
            $categories = self::filterCategoryIds($db, $categories);

            if (empty($categories)) {
                $fallback = self::defaultCategoryId($db);
                $categories = $fallback > 0 ? [$fallback] : [];
            }
        }

        $tags = $in['tags'] ?? '';
        if (is_array($tags)) {
            $tags = implode(',', array_map('strval', $tags));
        }

        $fields = self::mergeFields($db, $cid, $in['fields'] ?? []);

        /** @var PostEdit $edit */
        $edit = Widget::widget(PostEdit::class, null, ['do' => $isDraft ? 'save' : 'publish', 'cid' => $cid]);

        $contents = \Typecho\Plugin::factory('Widget_Contents_Post_Edit')->filter('write', $contents, $edit);
        $realId = $edit->apiSave($contents, $fields, $categories, (string) $tags);

        $payload = [
            'cid' => $realId,
            'title' => $contents['title'],
            'text' => $contents['text'],
            'visibility' => 'publish',
            'type' => $contents['type'],
            'password' => '',
        ];

        \Typecho\Plugin::factory('Widget_Contents_Post_Edit')
            ->call($isDraft ? 'finishSave' : 'finishPublish', $payload, $edit);

        return [
            'cid' => $realId,
            'status' => $isDraft ? 'draft' : 'publish',
            'scheduled' => !$isDraft && (int) $edit->created > time(),
            'created' => (int) $edit->created,
            'url' => $isDraft ? '' : (string) $edit->permalink,
        ];
    }

    /**
     * 批量修改文章状态（发布 / 转草稿）
     *
     * 只处理真实存在的文章与草稿，独立页面、已删除的 cid 会被跳过。
     * 不走 PostEdit 是为了避免逐篇重写分类、标签与自定义字段：
     * 状态切换本身不涉及这些关联数据，直接更新 type / modified 即可。
     *
     * @param array $cids 文章 ID 列表
     * @param string $status publish 发布 / draft 转草稿
     * @return array{status: string, cids: array, count: int, skipped: int}
     */
    public static function batchStatus(Db $db, array $cids, string $status): array
    {
        if (!in_array($status, ['publish', 'draft'], true)) {
            throw new \RuntimeException('批量操作只支持发布或转草稿');
        }

        $ids = array_values(array_unique(array_filter(
            array_map('intval', $cids),
            static function (int $cid): bool {
                return $cid > 0;
            }
        )));

        if (empty($ids)) {
            throw new \RuntimeException('请先选择文章');
        }

        if (count($ids) > 50) {
            throw new \RuntimeException('一次最多处理 50 篇');
        }

        // cid 已全部转成整数，拼进 IN 不存在注入风险
        $rows = $db->fetchAll(
            $db->select('cid', 'type')->from('table.contents')
                ->where('table.contents.cid IN (' . implode(',', $ids) . ')')
                ->where('table.contents.status = ?', 'publish')
        );

        $valid = [];

        foreach ($rows as $row) {
            if (in_array($row['type'], ['post', 'post_draft'], true)) {
                $valid[] = (int) $row['cid'];
            }
        }

        if (empty($valid)) {
            return ['status' => $status, 'cids' => [], 'count' => 0, 'skipped' => count($ids)];
        }

        $db->query(
            $db->update('table.contents')
                ->rows([
                    'type' => $status === 'draft' ? 'post_draft' : 'post',
                    'modified' => time(),
                ])
                ->where('table.contents.cid IN (' . implode(',', $valid) . ')')
        );

        return [
            'status' => $status,
            'cids' => $valid,
            'count' => count($valid),
            'skipped' => count($ids) - count($valid),
        ];
    }

    // ─── 内部方法 ──────────────────────────────────────────────────────────

    /**
     * @param mixed $query
     */
    private static function applyTypeFilter($query, ?string $type)
    {
        if ($type === null) {
            // 必须自己加括号：Typecho 用 AND 拼接后续 where，而 SQL 里 AND 优先级高于 OR
            $query->where('(table.contents.type = ? OR table.contents.type = ?)', 'post', 'post_draft');
        } else {
            $query->where('table.contents.type = ?', $type);
        }

        return $query;
    }

    /**
     * 规范化缩略名：留空自动生成、非法值拒绝、重复自动追加序号
     *
     * 已存在文章的原 slug 允许原样保留（网页端可能写过中文 slug），
     * 只有用户主动修改时才按新规则校验，避免老文章在 App 里改不动。
     */
    public static function normalizeSlug(Db $db, string $slug, string $title, int $cid): string
    {
        $slug = trim($slug);
        $current = '';

        if ($cid > 0) {
            $row = $db->fetchRow(
                $db->select('slug')->from('table.contents')
                    ->where('table.contents.cid = ?', $cid)->limit(1)
            );
            $current = $row ? (string) $row['slug'] : '';
        }

        if ($slug === '') {
            $slug = self::slugFromTitle($title);
        } elseif ($slug !== $current && !preg_match('/^[A-Za-z0-9_-]+$/', $slug)) {
            throw new \RuntimeException('固定链接只能包含字母、数字、下划线和短横线');
        }

        return self::uniqueSlug($db, $slug, $cid);
    }

    /**
     * 由标题生成合法的 ASCII 缩略名，生成不出来时退回 post
     */
    private static function slugFromTitle(string $title): string
    {
        $slug = '';

        if (class_exists(\Typecho\Common::class) && method_exists(\Typecho\Common::class, 'slugName')) {
            $slug = (string) \Typecho\Common::slugName($title);
        } else {
            $slug = $title;
        }

        $slug = trim((string) preg_replace('/[^A-Za-z0-9_-]+/', '-', $slug), '-_');

        return $slug !== '' ? $slug : 'post';
    }

    /**
     * 保证缩略名全局唯一（同一篇文章自身不算冲突）
     */
    private static function uniqueSlug(Db $db, string $slug, int $cid): string
    {
        for ($suffix = 1; $suffix <= 100; $suffix += 1) {
            $candidate = $suffix === 1 ? $slug : $slug . '-' . $suffix;
            $query = $db->select('cid')->from('table.contents')
                ->where('table.contents.slug = ?', $candidate)->limit(1);

            if ($cid > 0) {
                $query->where('table.contents.cid <> ?', $cid);
            }

            if (!$db->fetchRow($query)) {
                return $candidate;
            }
        }

        // 极端情况下（同名超过 100 篇）用随机串兜底，避免死循环
        return $slug . '-' . substr(bin2hex(random_bytes(4)), 0, 8);
    }

    /**
     * 过滤掉数据库里已不存在的分类 mid
     */
    private static function filterCategoryIds(Db $db, array $mids): array
    {
        if (empty($mids)) {
            return [];
        }

        $valid = array_map('intval', array_column(
            $db->fetchAll(
                $db->select('table.metas.mid')->from('table.metas')
                    ->where('table.metas.type = ?', 'category')
            ),
            'mid'
        ));

        return array_values(array_intersect($mids, $valid));
    }

    /**
     * 默认分类可能指向已被删除的 mid，这里做一次有效性校验
     */
    private static function defaultCategoryId(Db $db): int
    {
        $mid = (int) Options::alloc()->defaultCategory;

        if ($mid > 0) {
            $exists = $db->fetchRow(
                $db->select('mid')->from('table.metas')
                    ->where('mid = ?', $mid)->where('type = ?', 'category')->limit(1)
            );

            if ($exists) {
                return $mid;
            }
        }

        $first = $db->fetchRow(
            $db->select('mid')->from('table.metas')
                ->where('type = ?', 'category')
                ->order('table.metas.order', Db::SORT_ASC)
                ->order('table.metas.mid', Db::SORT_ASC)
                ->limit(1)
        );

        return $first ? (int) $first['mid'] : 0;
    }

    private static function fields(Db $db, int $cid): array
    {
        $fields = [];

        foreach (
            $db->fetchAll($db->select()->from('table.fields')->where('cid = ?', $cid)) as $row
        ) {
            $fields[$row['name']] = $row['type'] === 'json'
                ? json_decode((string) $row['str_value'], true)
                : $row[$row['type'] . '_value'];
        }

        return $fields;
    }

    /**
     * 默认值 ← 现有字段 ← 客户端字段
     *
     * 保留现有字段可以避免 applyFields 删除 SxlbSEO 等其他插件写入的字段。
     *
     * @param mixed $input
     */
    private static function mergeFields(Db $db, int $cid, $input): array
    {
        $client = is_array($input) ? $input : [];
        $existing = [];

        if ($cid > 0) {
            foreach (
                $db->fetchAll($db->select('name', 'type', 'str_value', 'int_value', 'float_value')
                    ->from('table.fields')->where('cid = ?', $cid)) as $row
            ) {
                $existing[$row['name']] = [
                    $row['type'],
                    $row['type'] === 'json'
                        ? json_decode((string) $row['str_value'], true)
                        : $row[$row['type'] . '_value'],
                ];
            }
        }

        return array_merge(self::DEFAULT_FIELDS, $existing, $client);
    }

    private static function categoryIds(Db $db, int $cid): array
    {
        return array_map('intval', array_column(
            $db->fetchAll(
                $db->select('table.metas.mid')
                    ->from('table.metas')
                    ->join('table.relationships', 'table.relationships.mid = table.metas.mid')
                    ->where('table.relationships.cid = ?', $cid)
                    ->where('table.metas.type = ?', 'category')
            ),
            'mid'
        ));
    }

    private static function tagNames(Db $db, int $cid): array
    {
        return array_column(
            $db->fetchAll(
                $db->select('table.metas.name')
                    ->from('table.metas')
                    ->join('table.relationships', 'table.relationships.mid = table.metas.mid')
                    ->where('table.relationships.cid = ?', $cid)
                    ->where('table.metas.type = ?', 'tag')
            ),
            'name'
        );
    }
}
