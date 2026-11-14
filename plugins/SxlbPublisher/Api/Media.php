<?php

namespace TypechoPlugin\SxlbPublisher\Api;

use Typecho\Config;
use Typecho\Db;
use Widget\Upload;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 媒体（附件）管理
 *
 * 附件的元数据存在 contents.text 的 JSON 里，字段与 Typecho 后台一致：
 *   name / path / size / type / mime / description
 * 删除时复用 Upload::deleteHandle，保证 Handsome 等插件的接管逻辑照常生效。
 */
class Media
{
    /**
     * 附件列表
     *
     * @return array{items: array, total: int, page: int, size: int}
     */
    public static function listing(Db $db, int $page, int $size): array
    {
        $countQuery = $db->select(['COUNT(table.contents.cid)' => 'num'])
            ->from('table.contents')
            ->where('table.contents.type = ?', 'attachment');

        $rowsQuery = $db->select('cid', 'title', 'slug', 'created', 'parent', 'text')
            ->from('table.contents')
            ->where('table.contents.type = ?', 'attachment')
            ->order('table.contents.created', Db::SORT_DESC)
            ->page($page, $size);

        $total = (int) $db->fetchObject($countQuery)->num;
        $items = [];

        foreach ($db->fetchAll($rowsQuery) as $row) {
            $data = json_decode((string) $row['text'], true);
            if (!is_array($data)) {
                $data = [];
            }

            $attachment = new Config($data);
            $type = strtolower((string) ($data['type'] ?? ''));

            $items[] = [
                'cid' => (int) $row['cid'],
                'title' => htmlspecialchars_decode((string) $row['title'], ENT_QUOTES),
                'name' => (string) ($data['name'] ?? $row['title']),
                'slug' => (string) $row['slug'],
                'path' => (string) ($data['path'] ?? ''),
                'url' => Upload::attachmentHandle($attachment),
                'size' => (int) ($data['size'] ?? 0),
                'type' => $type,
                'mime' => (string) ($data['mime'] ?? ''),
                'image' => in_array($type, ['jpg', 'jpeg', 'gif', 'png', 'tiff', 'bmp', 'webp', 'avif'], true),
                'parent' => (int) $row['parent'],
                'created' => (int) $row['created'],
            ];
        }

        return ['items' => $items, 'total' => $total, 'page' => $page, 'size' => $size];
    }

    /**
     * 删除附件（含磁盘文件与关联评论）
     *
     * @return array{cid:int,deleted:bool}
     */
    public static function delete(Db $db, int $cid): array
    {
        $row = $db->fetchRow(
            $db->select('cid', 'parent', 'text')->from('table.contents')
                ->where('cid = ?', $cid)->where('type = ?', 'attachment')->limit(1)
        );

        if (!$row) {
            throw new \RuntimeException('文件不存在');
        }

        $data = json_decode((string) $row['text'], true);
        $attachment = new Config(is_array($data) ? $data : []);

        // path 为空时跳过磁盘删除，避免误删站点根目录
        if ((string) $attachment->path !== '') {
            $file = __TYPECHO_ROOT_DIR__ . '/' . ltrim((string) $attachment->path, '/');
            $removed = Upload::deleteHandle([
                'cid' => $cid,
                'attachment' => $attachment,
                'parent' => (int) $row['parent'],
            ]);

            // 文件本就不存在时允许清理残留记录；确实删不掉则中止，避免留下无主文件
            if (!$removed && is_file($file)) {
                throw new \RuntimeException('磁盘文件删除失败，请检查 uploads 目录权限');
            }
        }

        $db->query($db->delete('table.contents')->where('cid = ?', $cid));
        $db->query($db->delete('table.comments')->where('cid = ?', $cid));

        return ['cid' => $cid, 'deleted' => true];
    }
}
