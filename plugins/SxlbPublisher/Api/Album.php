<?php

namespace TypechoPlugin\SxlbPublisher\Api;

use Typecho\Db;
use Typecho\Widget;
use TypechoPlugin\SxlbPublisher\PostEdit;
use Widget\Options;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 相册
 *
 * Handsome 主题的相册不是独立内容类型，而是「分类 slug 为 image 的文章」：
 *   - 分类页 category/image.php 输出封面网格（封面取 thumb 字段，缺失时回落到正文首图）
 *   - 文章页正文里的 <img> 被 TypePost::parseContentToImage 解析成图片墙
 * 所以这里只按分类查文章，并把封面与图片解析成客户端可直接渲染的结构。
 */
class Album
{
    /** 与主题 PostContent::isImageCategory 保持一致的分类缩略名 */
    private const SLUG = 'image';

    /** 只列出正常发布的文章，草稿不进相册 */
    private const TYPE = 'post';

    /**
     * 相册列表
     *
     * @return array{mid:int,name:string,items:array,total:int,page:int,size:int}
     */
    public static function listing(Db $db, int $page, int $size): array
    {
        $page = max(1, $page);
        $size = min(30, max(1, $size));

        // 分类被删除或改名后 slug 不再匹配，返回 mid=0 由客户端提示
        $meta = $db->fetchRow(
            $db->select('mid', 'name')->from('table.metas')
                ->where('slug = ?', self::SLUG)
                ->where('type = ?', 'category')
                ->limit(1)
        );

        if (!$meta) {
            return [
                'mid' => 0,
                'name' => '',
                'items' => [],
                'total' => 0,
                'page' => $page,
                'size' => $size,
            ];
        }

        $mid = (int) $meta['mid'];

        // 同一文章对同一 mid 只有一条关系记录，COUNT 不会翻倍
        $countQuery = $db->select(['COUNT(table.contents.cid)' => 'num'])
            ->from('table.contents')
            ->join('table.relationships', 'table.relationships.cid = table.contents.cid')
            ->where('table.relationships.mid = ?', $mid)
            ->where('table.contents.type = ?', self::TYPE)
            ->where('table.contents.status = ?', 'publish');

        // 取全列：permalink() 依赖 PostEdit::push() 读取 authorId / type 等字段
        $rowsQuery = $db->select('table.contents.*')
            ->from('table.contents')
            ->join('table.relationships', 'table.relationships.cid = table.contents.cid')
            ->where('table.relationships.mid = ?', $mid)
            ->where('table.contents.type = ?', self::TYPE)
            ->where('table.contents.status = ?', 'publish')
            ->order('table.contents.created', Db::SORT_DESC)
            ->page($page, $size);

        $total = (int) $db->fetchObject($countQuery)->num;
        $rows = $db->fetchAll($rowsQuery);
        $cids = array_map(static fn(array $row): int => (int) $row['cid'], $rows);
        $thumbs = self::thumbFields($db, $cids);

        $items = [];

        foreach ($rows as $row) {
            $cid = (int) $row['cid'];
            $images = self::imagesFromText((string) $row['text']);
            $cover = self::absolute((string) ($thumbs[$cid] ?? ''));

            if ($cover === '' && !empty($images)) {
                $cover = $images[0];
            }

            $items[] = [
                'cid' => $cid,
                'title' => htmlspecialchars_decode((string) $row['title'], ENT_QUOTES),
                'slug' => (string) $row['slug'],
                'created' => (int) $row['created'],
                'modified' => (int) $row['modified'],
                'cover' => $cover,
                'images' => $images,
                'count' => count($images),
                'url' => self::permalink($row),
            ];
        }

        return [
            'mid' => $mid,
            'name' => (string) $meta['name'],
            'items' => $items,
            'total' => $total,
            'page' => $page,
            'size' => $size,
        ];
    }

    /**
     * 批量取封面字段，避免每篇都查一次
     *
     * @param array $cids
     * @return array<int, string>
     */
    private static function thumbFields(Db $db, array $cids): array
    {
        if (empty($cids)) {
            return [];
        }

        $rows = $db->fetchAll(
            $db->select('cid', 'str_value')->from('table.fields')
                ->where('cid IN ?', $cids)
                ->where('name = ?', 'thumb')
        );

        $map = [];

        foreach ($rows as $row) {
            $map[(int) $row['cid']] = (string) $row['str_value'];
        }

        return $map;
    }

    /**
     * 从正文里提取图片地址（Markdown 与直接贴的 img 都要兼容）
     *
     * @return array<int, string>
     */
    private static function imagesFromText(string $text): array
    {
        if (strpos($text, '<!--markdown-->') === 0) {
            $text = substr($text, 15);
        }

        $images = [];

        if (preg_match_all('/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/', $text, $matches)) {
            $images = $matches[1];
        }

        if (preg_match_all('/<img[^>]+src=["\']([^"\']+)["\']/i', $text, $matches)) {
            $images = array_merge($images, $matches[1]);
        }

        $images = array_values(array_unique(array_filter($images)));

        return array_map(static fn(string $url): string => self::absolute($url), $images);
    }

    /**
     * 相对路径补成站点绝对地址，外链原样返回
     */
    private static function absolute(string $url): string
    {
        $url = trim($url);

        if ($url === '' || preg_match('#^(https?:)?//#i', $url) || strpos($url, 'data:') === 0) {
            return $url;
        }

        return rtrim((string) Options::alloc()->siteUrl, '/') . '/' . ltrim($url, '/');
    }

    /**
     * 按 Typecho 的永久链接规则生成完整地址
     */
    private static function permalink(array $row): string
    {
        /** @var PostEdit $edit */
        $edit = Widget::widget(PostEdit::class, null, ['cid' => (int) $row['cid']]);
        $edit->push($row);

        return (string) $edit->permalink;
    }
}
