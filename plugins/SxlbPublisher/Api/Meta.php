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

        $slug = self::uniqueSlug($db, $name);
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

    private static function uniqueSlug(Db $db, string $name): string
    {
        $slug = Common::slugName($name);

        $exists = $db->fetchRow(
            $db->select('mid')->from('table.metas')->where('slug = ?', $slug)->limit(1)
        );

        if ($exists) {
            $slug .= '-' . substr(md5($name), 0, 6);
        }

        return $slug;
    }
}
