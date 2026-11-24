<?php

namespace TypechoPlugin\SxlbPublisher\Api;

use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * Handsome 友情链接管理
 *
 * 数据存放在 Handsome 插件创建的 table.links 表：
 *   lid / name / url / sort / image / description / user / order
 *
 * sort 决定前台输出位置：
 *   ten    全站链接，首页侧边栏
 *   one    内页链接，友链页面「内页链接」标签
 *   good   推荐链接，友链页面「推荐链接」标签
 *   others 失效链接，不在任何位置输出
 */
class Links
{
    /** 链接输出位置与前台一致 */
    private const SORTS = [
        'ten' => '全站链接',
        'one' => '内页链接',
        'good' => '推荐链接',
        'others' => '失效链接',
    ];

    /**
     * @return array{items: array<int, array<string, mixed>>, total: int, sorts: array<string, string>}
     */
    public static function listing(Db $db): array
    {
        $items = [];

        foreach (self::rows($db) as $row) {
            $items[] = self::parse($row);
        }

        return [
            'items' => $items,
            'total' => count($items),
            'sorts' => self::SORTS,
        ];
    }

    /**
     * 新增或更新链接
     *
     * @param array<string, mixed> $in
     * @return array<string, mixed>
     */
    public static function save(Db $db, array $in): array
    {
        $lid = (int) ($in['lid'] ?? 0);
        $name = trim((string) ($in['name'] ?? ''));
        $url = trim((string) ($in['url'] ?? ''));

        if ($name === '') {
            throw new \RuntimeException('链接名称不能为空');
        }

        if ($url === '') {
            throw new \RuntimeException('链接地址不能为空');
        }

        $url = self::normalizeUrl($url, '链接地址');
        $image = trim((string) ($in['image'] ?? ''));

        if ($image !== '') {
            $image = self::normalizeUrl($image, '链接图片');
        }

        $sort = (string) ($in['sort'] ?? 'ten');

        if (!isset(self::SORTS[$sort])) {
            throw new \RuntimeException('链接输出位置不合法');
        }

        $description = trim((string) ($in['description'] ?? ''));

        if (mb_strlen($description) > 200) {
            throw new \RuntimeException('链接描述不能超过 200 字');
        }

        self::assertTable($db);

        $row = [
            'name' => mb_substr($name, 0, 60),
            'url' => $url,
            'sort' => $sort,
            'image' => $image === '' ? null : $image,
            'description' => mb_substr($description, 0, 200),
        ];

        // order 留空时新增自动放到末尾，更新则保持原排序
        $order = isset($in['order']) && $in['order'] !== '' ? max(0, (int) $in['order']) : null;

        if ($lid > 0) {
            $exists = $db->fetchRow(
                $db->select('lid')->from('table.links')->where('lid = ?', $lid)->limit(1)
            );

            if (!$exists) {
                throw new \RuntimeException('链接不存在');
            }

            if ($order !== null) {
                $row['order'] = $order;
            }

            $db->query($db->update('table.links')->rows($row)->where('lid = ?', $lid));
        } else {
            if ($order === null) {
                $max = $db->fetchObject(
                    $db->select(['MAX(order)' => 'maxOrder'])->from('table.links')
                );
                $order = (int) ($max->maxOrder ?? 0) + 1;
            }

            $row['order'] = $order;
            $lid = (int) $db->query($db->insert('table.links')->rows($row));
        }

        self::clearCache();

        $saved = $db->fetchRow(
            $db->select()->from('table.links')->where('lid = ?', $lid)->limit(1)
        );

        return self::parse($saved);
    }

    /**
     * @return array{deleted: int}
     */
    public static function delete(Db $db, int $lid): array
    {
        self::assertTable($db);

        $exists = $db->fetchRow(
            $db->select('lid')->from('table.links')->where('lid = ?', $lid)->limit(1)
        );

        if (!$exists) {
            throw new \RuntimeException('链接不存在');
        }

        $db->query($db->delete('table.links')->where('lid = ?', $lid));
        self::clearCache();

        return ['deleted' => $lid];
    }

    // ─── 内部方法 ──────────────────────────────────────────────────────────

    /**
     * @return array<int, array<string, mixed>>
     */
    private static function rows(Db $db): array
    {
        self::assertTable($db);

        return $db->fetchAll(
            $db->select()->from('table.links')
                ->order('table.links.order', Db::SORT_ASC)
                ->order('table.links.lid', Db::SORT_ASC)
        );
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private static function parse(array $row): array
    {
        $sort = (string) ($row['sort'] ?? '');

        return [
            'lid' => (int) ($row['lid'] ?? 0),
            'name' => (string) ($row['name'] ?? ''),
            'url' => (string) ($row['url'] ?? ''),
            'sort' => $sort,
            'sortName' => self::SORTS[$sort] ?? '未分类',
            'image' => (string) ($row['image'] ?? ''),
            'description' => (string) ($row['description'] ?? ''),
            'order' => (int) ($row['order'] ?? 0),
        ];
    }

    /**
     * 链接必须是 http(s)，避免 javascript: 等危险协议
     */
    private static function normalizeUrl(string $url, string $label): string
    {
        if (!preg_match('~^https?://~i', $url)) {
            throw new \RuntimeException($label . '必须以 http:// 或 https:// 开头');
        }

        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            throw new \RuntimeException($label . '格式不正确');
        }

        return $url;
    }

    /**
     * 未启用 Handsome 插件时 table.links 不存在
     */
    private static function assertTable(Db $db): void
    {
        try {
            $db->fetchRow($db->select('lid')->from('table.links')->limit(1));
        } catch (\Throwable $e) {
            throw new \RuntimeException('未检测到 Handsome 友链表，请先启用 Handsome 插件');
        }
    }

    /**
     * 链接会出现在页面与侧边栏，改动后清理 Handsome 页面缓存
     */
    private static function clearCache(): void
    {
        try {
            if (class_exists('CacheUtil')) {
                (new \CacheUtil(null, false))->cacheClear();
            }
        } catch (\Throwable $e) {
            error_log('[SxlbPublisher] 清理 Handsome 缓存失败: ' . $e->getMessage());
        }
    }
}
