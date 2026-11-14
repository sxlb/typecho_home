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
    public static function listing(Db $db, int $page, int $size, string $status, string $keyword = ''): array
    {
        $type = $status === 'draft' ? 'post_draft' : ($status === 'publish' ? 'post' : null);

        $countQuery = $db->select(['COUNT(table.contents.cid)' => 'num'])->from('table.contents');
        $rowsQuery = $db->select('cid', 'title', 'slug', 'created', 'modified', 'status', 'type')
            ->from('table.contents')
            ->order('table.contents.created', Db::SORT_DESC)
            ->page($page, $size);

        self::applyTypeFilter($countQuery, $type);
        self::applyTypeFilter($rowsQuery, $type);

        $keyword = trim($keyword);

        if ($keyword !== '') {
            // 转义 LIKE 通配符，避免用户输入的 % _ 被当成模式
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $keyword) . '%';
            $countQuery->where('table.contents.title LIKE ?', $like);
            $rowsQuery->where('table.contents.title LIKE ?', $like);
        }

        $total = (int) $db->fetchObject($countQuery)->num;
        $now = time();
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

        return [
            'cid' => (int) $row['cid'],
            'title' => htmlspecialchars_decode((string) $row['title'], ENT_QUOTES),
            'text' => $text,
            'slug' => (string) $row['slug'],
            'url' => self::permalink($row),
            'created' => (int) $row['created'],
            'modified' => (int) $row['modified'],
            'status' => $row['type'] === 'post_draft' ? 'draft' : 'publish',
            'categories' => self::categoryIds($db, $cid),
            'tags' => implode(',', self::tagNames($db, $cid)),
            'fields' => self::fields($db, $cid),
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
            'slug' => trim((string) ($in['slug'] ?? '')),
            'type' => $isDraft ? 'post_draft' : 'post',
            'status' => 'publish',
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
            $categories = array_values(array_filter(array_map('intval', $categories)));
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

    // ─── 内部方法 ──────────────────────────────────────────────────────────

    /**
     * @param mixed $query
     */
    private static function applyTypeFilter($query, ?string $type)
    {
        if ($type === null) {
            $query->where('table.contents.type = ? OR table.contents.type = ?', 'post', 'post_draft');
        } else {
            $query->where('table.contents.type = ?', $type);
        }

        return $query;
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
