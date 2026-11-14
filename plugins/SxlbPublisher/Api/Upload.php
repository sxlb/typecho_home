<?php

namespace TypechoPlugin\SxlbPublisher\Api;

use Typecho\Common;
use Typecho\Widget;
use Widget\Options;
use Widget\Upload as UploadWidget;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 图片上传
 *
 * 这里不复用 Widget\Upload::uploadHandle，因为 Handsome 在该钩子上接管了
 * 后台的上传请求，API 上下文缺少它需要的参数会直接返回失败。
 * 因此按核心同样的规则自行落盘：扩展名白名单 + 年/月目录 + 随机文件名。
 */
class Upload
{
    private const UPLOAD_DIR = '/usr/uploads';

    /**
     * @param int $cid 关联文章 cid，0 表示不关联
     * @param int $authorId 附件归属用户
     * @return array{id: int, url: string, path: string, name: string, size: int, type: string}
     */
    public static function handle(int $cid, int $authorId): array
    {
        if (empty($_FILES)) {
            throw new \RuntimeException('没有收到文件');
        }

        $file = reset($_FILES);

        if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new \RuntimeException('文件上传失败，错误码 ' . (int) ($file['error'] ?? -1));
        }

        if (!is_uploaded_file($file['tmp_name'])) {
            throw new \RuntimeException('非法的上传文件');
        }

        $result = self::store($file);

        /** @var UploadWidget $widget */
        $widget = Widget::widget(UploadWidget::class);

        $id = $widget->insert([
            'title' => $result['name'],
            'slug' => $result['name'],
            'type' => 'attachment',
            'status' => 'publish',
            'text' => json_encode($result, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            'authorId' => $authorId,
            'allowComment' => 1,
            'allowPing' => 0,
            'allowFeed' => 1,
            'parent' => $cid,
        ]);

        if ($id <= 0) {
            throw new \RuntimeException('附件记录写入失败');
        }

        return [
            'id' => (int) $id,
            'url' => Common::url($result['path'], Options::alloc()->siteUrl),
            'path' => $result['path'],
            'name' => $result['name'],
            'size' => (int) $result['size'],
            'type' => (string) $result['type'],
        ];
    }

    /**
     * 保存文件并返回与核心一致的描述结构
     */
    private static function store(array $file): array
    {
        $name = str_replace(['"', '<', '>', '\\'], '', (string) $file['name']);
        $name = basename(str_replace('\\', '/', $name));
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));

        if ($ext === '' || !UploadWidget::checkFileType($ext)) {
            throw new \RuntimeException('不允许的上传类型：' . ($ext ?: '未知'));
        }

        $uploadDir = defined('__TYPECHO_UPLOAD_DIR__') ? __TYPECHO_UPLOAD_DIR__ : self::UPLOAD_DIR;
        $uploadRoot = defined('__TYPECHO_UPLOAD_ROOT_DIR__') ? __TYPECHO_UPLOAD_ROOT_DIR__ : __TYPECHO_ROOT_DIR__;

        $directory = Common::url($uploadDir, $uploadRoot) . '/' . date('Y') . '/' . date('m');

        if (!is_dir($directory) && !@mkdir($directory, 0755, true) && !is_dir($directory)) {
            throw new \RuntimeException('创建上传目录失败');
        }

        $fileName = sprintf('%u', crc32(uniqid())) . '.' . $ext;
        $target = $directory . '/' . $fileName;

        if (!@move_uploaded_file($file['tmp_name'], $target)) {
            throw new \RuntimeException('写入文件失败，请检查目录权限');
        }

        return [
            'name' => $name,
            'path' => $uploadDir . '/' . date('Y') . '/' . date('m') . '/' . $fileName,
            'size' => (int) (filesize($target) ?: ($file['size'] ?? 0)),
            'type' => $ext,
            'mime' => (string) ($file['type'] ?? ''),
        ];
    }
}
