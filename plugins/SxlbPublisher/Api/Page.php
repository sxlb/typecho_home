<?php

namespace TypechoPlugin\SxlbPublisher\Api;

use Typecho\Config;
use Typecho\Db;
use Typecho\Widget;
use TypechoPlugin\SxlbPublisher\PageEdit;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 独立页面管理
 *
 * 页面与文章共用 contents 表，但 type = 'page'，没有分类 / 标签，
 * 额外包含模板、排序、父页面与隐藏状态。时光机、友链、留言板等都是页面。
 */
class Page
{
    /**
     * 页面列表
     *
     * @return array{items: array, total: int, page: int, size: int, templates: array}
     */
    public static function listing(Db $db, int $page, int $size): array
    {
        $page = max(1, $page);
        $size = min(50, max(1, $size));

        $countQuery = $db->select(['COUNT(cid)' => 'num'])
            ->from('table.contents')
            ->where('type = ?', 'page');

        $rowsQuery = $db->select(
            'cid',
            'title',
            'slug',
            'status',
            'created',
            'modified',
            'order',
            'template',
            'parent'
        )
            ->from('table.contents')
            ->where('type = ?', 'page')
            ->order('cid', Db::SORT_ASC)
            ->page($page, $size);

        $total = (int) $db->fetchObject($countQuery)->num;
        $items = [];

        foreach ($db->fetchAll($rowsQuery) as $row) {
            $items[] = [
                'cid' => (int) $row['cid'],
                'title' => htmlspecialchars_decode((string) $row['title'], ENT_QUOTES),
                'slug' => (string) $row['slug'],
                'status' => (string) $row['status'],
                'hidden' => (string) $row['status'] === 'hidden',
                'created' => (int) $row['created'],
                'modified' => (int) $row['modified'],
                'order' => (int) $row['order'],
                'template' => (string) $row['template'],
                'parent' => (int) $row['parent'],
            ];
        }

        return [
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'size' => $size,
            'templates' => self::templates(),
        ];
    }

    /**
     * 页面详情
     */
    public static function detail(Db $db, int $cid): ?array
    {
        $row = $db->fetchRow(
            $db->select()->from('table.contents')
                ->where('cid = ?', $cid)
                ->where('type = ?', 'page')
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
            'status' => (string) $row['status'],
            'hidden' => (string) $row['status'] === 'hidden',
            'template' => (string) $row['template'],
            'order' => (int) $row['order'],
            'parent' => (int) $row['parent'],
            'allowComment' => (int) $row['allowComment'],
            'created' => (int) $row['created'],
            'modified' => (int) $row['modified'],
            'fields' => self::fields($db, $cid),
            'templates' => self::templates(),
        ];
    }

    /**
     * 新建或更新页面
     *
     * @param array $in 请求参数
     * @param Config $config 插件配置
     * @return array{cid:int,status:string,created:int,url:string}
     */
    public static function save(array $in, Config $config): array
    {
        $db = Db::get();
        $cid = (int) ($in['cid'] ?? 0);
        $title = trim((string) ($in['title'] ?? ''));
        $text = (string) ($in['text'] ?? '');

        if (trim(strip_tags($text)) === '') {
            throw new \RuntimeException('正文不能为空');
        }

        if (strpos($text, '<!--markdown-->') !== 0) {
            $text = '<!--markdown-->' . $text;
        }

        $prev = null;

        if ($cid > 0) {
            $prev = $db->fetchRow(
                $db->select()->from('table.contents')
                    ->where('cid = ?', $cid)->where('type = ?', 'page')->limit(1)
            );

            if (!$prev) {
                throw new \RuntimeException('页面不存在或已被删除');
            }
        }

        $status = (string) ($in['status'] ?? 'publish');
        if (!in_array($status, ['publish', 'hidden'], true)) {
            $status = 'publish';
        }

        $templates = self::templates();
        $template = (string) ($in['template'] ?? ($prev['template'] ?? ''));

        if ($template !== '' && !isset($templates[$template])) {
            $template = $prev ? (string) $prev['template'] : '';
        }

        $slug = Post::normalizeSlug($db, (string) ($in['slug'] ?? ''), $title, $cid);

        // 时光机依赖固定链接 cross，编辑时不允许改掉
        if ($prev && (string) $prev['slug'] === 'cross') {
            $slug = 'cross';
        }

        $parent = max(0, (int) ($in['parent'] ?? ($prev['parent'] ?? 0)));
        if ($parent === $cid) {
            $parent = 0;
        }

        $contents = [
            'cid' => $cid,
            'title' => $title !== '' ? $title : '未命名页面',
            'text' => $text,
            'slug' => $slug,
            'type' => 'page',
            'status' => $status,
            'authorId' => $prev
                ? (int) $prev['authorId']
                : max(1, (int) ($config->authorId ?? 1)),
            'allowComment' => isset($in['allowComment'])
                ? (int) (bool) $in['allowComment']
                : (int) ($prev['allowComment'] ?? 1),
            'allowPing' => (int) ($prev['allowPing'] ?? 1),
            'allowFeed' => (int) ($prev['allowFeed'] ?? 1),
            'template' => $template,
            'order' => max(0, (int) ($in['order'] ?? ($prev['order'] ?? 0))),
            'parent' => $parent,
            'modified' => time(),
        ];

        $created = (int) ($in['created'] ?? 0);

        if ($created > 0) {
            $contents['created'] = $created;
        } elseif ($prev) {
            $contents['created'] = (int) $prev['created'];
        } else {
            $contents['created'] = time();
        }

        $fields = self::mergeFields($db, $cid, $in['fields'] ?? []);

        /** @var PageEdit $edit */
        $edit = Widget::widget(PageEdit::class, null, ['do' => 'publish', 'cid' => $cid]);

        $contents = \Typecho\Plugin::factory('Widget_Contents_Page_Edit')->filter('write', $contents, $edit);
        $realId = $edit->apiSave($contents, $fields);

        $payload = [
            'cid' => $realId,
            'title' => $contents['title'],
            'text' => $contents['text'],
            'visibility' => $status,
            'type' => 'page',
            'password' => '',
        ];

        \Typecho\Plugin::factory('Widget_Contents_Page_Edit')
            ->call('finishPublish', $payload, $edit);

        return [
            'cid' => $realId,
            'status' => $status,
            'created' => (int) $contents['created'],
            'url' => (string) $edit->permalink,
        ];
    }

    /**
     * 删除页面
     *
     * @return array{cid:int,deleted:bool}
     */
    public static function delete(int $cid): array
    {
        /** @var PageEdit $edit */
        $edit = Widget::widget(PageEdit::class, null, ['do' => 'delete', 'cid' => $cid]);

        if (!$edit->apiDelete($cid)) {
            throw new \RuntimeException('页面不存在或已被删除');
        }

        return ['cid' => $cid, 'deleted' => true];
    }

    /**
     * 当前主题支持的自定义页面模板
     *
     * @return array<string,string> 文件名 => 模板名称
     */
    public static function templates(): array
    {
        /** @var PageEdit $edit */
        $edit = Widget::widget(PageEdit::class, null, []);

        return $edit->getTemplates();
    }

    // ─── 内部方法 ──────────────────────────────────────────────────────────

    private static function permalink(array $row): string
    {
        /** @var PageEdit $edit */
        $edit = Widget::widget(PageEdit::class, null, ['cid' => (int) $row['cid']]);
        $edit->push($row);

        return (string) $edit->permalink;
    }

    /**
     * @return array<string,mixed>
     */
    private static function fields(Db $db, int $cid): array
    {
        $rows = $db->fetchAll(
            $db->select('name', 'type', 'str_value', 'int_value', 'float_value')
                ->from('table.fields')->where('cid = ?', $cid)->order('name', Db::SORT_ASC)
        );

        $fields = [];

        foreach ($rows as $row) {
            $fields[(string) $row['name']] = $row['type'] === 'json'
                ? json_decode((string) $row['str_value'], true)
                : $row[$row['type'] . '_value'];
        }

        return $fields;
    }

    /**
     * 页面不注入文章那套默认字段，只保留已有字段并合并客户端提交的字段
     *
     * 已有字段按 [type, value] 保留原类型，客户端字段统一按字符串写入，
     * 与 Typecho EditTrait::applyFields 的入参约定一致。
     *
     * @param mixed $input
     * @return array<string,mixed>
     */
    private static function mergeFields(Db $db, int $cid, $input): array
    {
        $fields = [];

        if ($cid > 0) {
            $rows = $db->fetchAll(
                $db->select('name', 'type', 'str_value', 'int_value', 'float_value')
                    ->from('table.fields')->where('cid = ?', $cid)
            );

            foreach ($rows as $row) {
                $fields[(string) $row['name']] = [
                    (string) $row['type'],
                    $row['type'] === 'json'
                        ? json_decode((string) $row['str_value'], true)
                        : $row[$row['type'] . '_value'],
                ];
            }
        }

        if (is_array($input)) {
            foreach ($input as $name => $value) {
                $name = trim((string) $name);

                if ($name === '' || !is_scalar($value)) {
                    continue;
                }

                $fields[$name] = (string) $value;
            }
        }

        return $fields;
    }
}
