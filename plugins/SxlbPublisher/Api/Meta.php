<?php

namespace TypechoPlugin\SxlbPublisher\Api;

use Typecho\Common;
use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 分类与标签
 */
class Meta
{
    /**
     * 列表
     *
     * @param string $type category / tag / 空（两者都返回）
     * @return array
     */
    public static function listing(Db $db, string $type = ''): array
    {
        $result = ['categories' => [], 'tags' => []];

        if ($type === '' || $type === 'category') {
            $rows = $db->fetchAll(
                $db->select('mid', 'name', 'slug', 'description', 'count', 'order', 'parent')
                    ->from('table.metas')
                    ->where('type = ?', 'category')
                    ->order('table.metas.order', Db::SORT_ASC)
            );

            foreach ($rows as $row) {
                $result['categories'][] = [
                    'mid' => (int) $row['mid'],
                    'name' => (string) $row['name'],
                    'slug' => (string) $row['slug'],
                    'description' => (string) $row['description'],
                    'count' => (int) $row['count'],
                    'parent' => (int) $row['parent'],
                ];
            }
        }

        if ($type === '' || $type === 'tag') {
            $rows = $db->fetchAll(
                $db->select('mid', 'name', 'slug', 'count')
                    ->from('table.metas')
                    ->where('type = ?', 'tag')
                    ->order('table.metas.count', Db::SORT_DESC)
                    ->limit(300)
            );

            foreach ($rows as $row) {
                $result['tags'][] = [
                    'mid' => (int) $row['mid'],
                    'name' => (string) $row['name'],
                    'slug' => (string) $row['slug'],
                    'count' => (int) $row['count'],
                ];
            }
        }

        return $result;
    }

    /**
     * 新建分类或标签，已存在则直接返回
     */
    public static function create(Db $db, string $name, string $type, int $parent = 0): array
    {
        $exists = $db->fetchRow(
            $db->select('mid', 'name', 'slug', 'count')
                ->from('table.metas')
                ->where('type = ?', $type)
                ->where('name = ?', $name)
                ->limit(1)
        );

        if ($exists) {
            return ['mid' => (int) $exists['mid'], 'name' => $exists['name'], 'slug' => $exists['slug']];
        }

        $slug = self::uniqueSlug($db, Common::slugName($name));
        $db->query($db->insert('table.metas')->rows([
            'name' => $name,
            'slug' => $slug,
            'type' => $type,
            'description' => '',
            'count' => 0,
            'order' => 0,
            'parent' => $type === 'category' ? $parent : 0,
        ]));

        return ['mid' => (int) $db->lastInsertId(), 'name' => $name, 'slug' => $slug];
    }

    /**
     * 新建或更新分类 / 标签
     *
     * mid = 0 表示新建，type 仅新建时生效；更新沿用数据库中的类型。
     *
     * @param array $data name / slug / description / order / parent / type
     */
    public static function save(Db $db, int $mid, array $data): array
    {
        $name = trim((string) ($data['name'] ?? ''));

        if ($name === '') {
            throw new \RuntimeException('名称不能为空');
        }

        $existing = null;

        if ($mid > 0) {
            $existing = $db->fetchRow(
                $db->select('mid', 'type', 'count')->from('table.metas')
                    ->where('mid = ?', $mid)->limit(1)
            );

            if (!$existing) {
                throw new \RuntimeException('分类或标签不存在');
            }

            $type = (string) $existing['type'];
        } else {
            $type = (string) ($data['type'] ?? 'tag');

            if (!in_array($type, ['category', 'tag'], true)) {
                throw new \RuntimeException('type 只能是 category 或 tag');
            }
        }

        $slug = trim((string) ($data['slug'] ?? ''));

        if ($slug === '') {
            $slug = Common::slugName($name);
        }

        $slug = self::uniqueSlug($db, $slug, $mid);

        $parent = 0;

        if ($type === 'category') {
            $parent = max(0, (int) ($data['parent'] ?? 0));

            if ($parent === $mid) {
                throw new \RuntimeException('不能把自己设为父分类');
            }

            if ($parent > 0) {
                $exists = $db->fetchRow(
                    $db->select('mid')->from('table.metas')
                        ->where('mid = ?', $parent)->where('type = ?', 'category')->limit(1)
                );

                if (!$exists) {
                    throw new \RuntimeException('父分类不存在');
                }

                // 沿父级链向上回溯，防止把父分类设成自己的子孙（分类树成环）
                if ($mid > 0) {
                    $cursor = $parent;
                    $visited = [];

                    while ($cursor > 0 && !isset($visited[$cursor])) {
                        if ($cursor === $mid) {
                            throw new \RuntimeException('不能把子孙分类设为父分类');
                        }

                        $visited[$cursor] = true;

                        $up = $db->fetchRow(
                            $db->select('parent')->from('table.metas')
                                ->where('mid = ?', $cursor)->limit(1)
                        );

                        $cursor = $up ? (int) $up['parent'] : 0;
                    }
                }
            }
        }

        $rows = [
            'name' => $name,
            'slug' => $slug,
            'description' => (string) ($data['description'] ?? ''),
            'order' => max(0, (int) ($data['order'] ?? 0)),
            'parent' => $parent,
        ];

        if ($mid > 0) {
            $db->query($db->update('table.metas')->rows($rows)->where('mid = ?', $mid));

            return [
                'mid' => $mid,
                'type' => $type,
                'count' => (int) $existing['count'],
            ] + $rows;
        }

        $rows['type'] = $type;
        $rows['count'] = 0;
        $db->query($db->insert('table.metas')->rows($rows));

        return ['mid' => (int) $db->lastInsertId()] + $rows;
    }

    /**
     * 删除分类或标签
     *
     * 与后台一致：清理关联关系；删除分类时把子分类上移到父分类。
     */
    public static function delete(Db $db, int $mid): array
    {
        $row = $db->fetchRow(
            $db->select('mid', 'type', 'parent')->from('table.metas')
                ->where('mid = ?', $mid)->limit(1)
        );

        if (!$row) {
            throw new \RuntimeException('分类或标签不存在');
        }

        $type = (string) $row['type'];
        $db->query($db->delete('table.metas')->where('mid = ?', $mid));
        $db->query($db->delete('table.relationships')->where('mid = ?', $mid));

        if ($type === 'category') {
            $db->query(
                $db->update('table.metas')
                    ->rows(['parent' => (int) $row['parent']])
                    ->where('parent = ?', $mid)
            );
        }

        return ['mid' => $mid, 'type' => $type, 'deleted' => true];
    }

    private static function uniqueSlug(Db $db, string $slug, int $excludeMid = 0): string
    {
        $base = $slug !== '' ? $slug : 'item';
        $candidate = $base;
        $index = 1;

        while (self::slugExists($db, $candidate, $excludeMid)) {
            $candidate = $base . '-' . $index;
            $index++;
        }

        return $candidate;
    }

    private static function slugExists(Db $db, string $slug, int $excludeMid): bool
    {
        $query = $db->select('mid')->from('table.metas')->where('slug = ?', $slug);

        if ($excludeMid > 0) {
            $query->where('mid <> ?', $excludeMid);
        }

        return (bool) $db->fetchRow($query->limit(1));
    }
}
