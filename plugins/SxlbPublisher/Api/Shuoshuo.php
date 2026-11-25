<?php

namespace TypechoPlugin\SxlbPublisher\Api;

use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 时光机（说说）
 *
 * Handsome 主题的时光机不是独立内容类型，而是「slug = cross 的页面」下的站长评论：
 *   comments.cid = 页面 cid、type = comment、status = approved、authorId != 0
 * 因此发布 / 删除都直接操作 comments 表，与在网页端发布说说的结果完全一致。
 *
 * 私密说说在正文外包裹 [secret]...[/secret]，由主题在渲染时按登录状态决定是否可见。
 */
class Shuoshuo
{
    /** 时光机页面 slug */
    private const PAGE_SLUG = 'cross';

    /** 单条说说最大字数，与主题评论框 maxlength 一致 */
    private const MAX_LENGTH = 65525;

    /**
     * 说说列表
     *
     * @return array{items: array, total: int, page: int, size: int, cid: int}
     */
    public static function listing(Db $db, int $page, int $size, int $ownerId): array
    {
        $cid = self::pageId($db);

        if ($cid <= 0) {
            throw new \RuntimeException('没有找到时光机页面，请先创建固定链接为 cross 的页面');
        }

        $page = max(1, $page);
        $size = min(50, max(1, $size));
        $ownerId = max(1, $ownerId);

        $countQuery = $db->select(['COUNT(coid)' => 'num'])
            ->from('table.comments')
            ->where('cid = ?', $cid)
            ->where('type = ?', 'comment')
            ->where('status = ?', 'approved')
            // 只认配置的站长 UID：注册读者在时光机页的评论不算说说
            ->where('authorId = ?', $ownerId);

        $rowsQuery = $db->select(
            'coid',
            'cid',
            'created',
            'author',
            'authorId',
            'text',
            'status',
            'stars'
        )
            ->from('table.comments')
            ->where('cid = ?', $cid)
            ->where('type = ?', 'comment')
            ->where('status = ?', 'approved')
            ->where('authorId = ?', $ownerId)
            ->order('created', Db::SORT_DESC)
            ->page($page, $size);

        $total = (int) $db->fetchObject($countQuery)->num;
        $items = [];

        foreach ($db->fetchAll($rowsQuery) as $row) {
            $items[] = self::parseItem($row);
        }

        return ['items' => $items, 'total' => $total, 'page' => $page, 'size' => $size, 'cid' => $cid];
    }

    /**
     * 发布一条说说
     *
     * @return array 解析后的说说，结构同列表项
     */
    public static function create(
        Db $db,
        string $text,
        bool $secret,
        int $authorId,
        string $ip = '',
        string $agent = ''
    ): array {
        $text = trim(str_replace(["\r\n", "\r"], "\n", $text));

        if ($text === '') {
            throw new \RuntimeException('说说内容不能为空');
        }

        // 按字节再兜一次：comments.text 是 TEXT（65535 字节），
        // 中文按字符校验通过但字节可能溢出，预留 [secret] 标签的空间
        if (mb_strlen($text) > self::MAX_LENGTH || strlen($text) > 65500) {
            throw new \RuntimeException('说说内容过长，最多 ' . self::MAX_LENGTH . ' 字');
        }

        $cid = self::pageId($db);

        if ($cid <= 0) {
            throw new \RuntimeException('没有找到时光机页面，请先创建固定链接为 cross 的页面');
        }

        if ($secret) {
            $text = '[secret]' . $text . '[/secret]';
        }

        $user = self::adminUser($db, $authorId);
        $created = time();
        $agent = $agent !== '' ? $agent : 'SxlbPublisher';

        $comment = [
            'cid' => $cid,
            'created' => $created,
            'author' => $user['screenName'] !== '' ? $user['screenName'] : $user['name'],
            'authorId' => $user['uid'],
            'ownerId' => $user['uid'],
            'mail' => $user['mail'],
            'url' => $user['url'],
            'ip' => $ip,
            // comments.agent 是 varchar(511)：超长 UA 会溢出或被截断
            'agent' => mb_substr($agent, 0, 255),
            'text' => $text,
            'type' => 'comment',
            'status' => 'approved',
            'parent' => 0,
        ];

        $coid = (int) $db->query($db->insert('table.comments')->rows($comment));
        self::recount($db, $cid);
        self::clearThemeCache();

        return self::parseItem([
            'coid' => $coid,
            'cid' => $cid,
            'created' => $created,
            'author' => $comment['author'],
            'authorId' => $user['uid'],
            'text' => $text,
            'status' => 'approved',
            'stars' => 0,
        ]);
    }

    /**
     * 编辑一条说说
     *
     * 只允许改动时光机页面下站长发布的说说，发布时间与点赞数保持不变。
     *
     * @return array 解析后的说说，结构同列表项
     */
    public static function update(Db $db, int $coid, string $text, bool $secret, int $ownerId): array
    {
        $row = $db->fetchRow(
            $db->select(
                'coid',
                'cid',
                'created',
                'author',
                'authorId',
                'status',
                'stars'
            )
                ->from('table.comments')->where('coid = ?', $coid)->limit(1)
        );

        if (!$row) {
            throw new \RuntimeException('说说不存在');
        }

        $cid = self::pageId($db);

        if (
            $cid <= 0
            || (int) $row['cid'] !== $cid
            || (int) $row['authorId'] !== max(1, $ownerId)
        ) {
            throw new \RuntimeException('只能编辑时光机里的说说');
        }

        $text = trim(str_replace(["\r\n", "\r"], "\n", $text));

        if ($text === '') {
            throw new \RuntimeException('说说内容不能为空');
        }

        if (mb_strlen($text) > self::MAX_LENGTH || strlen($text) > 65500) {
            throw new \RuntimeException('说说内容过长，最多 ' . self::MAX_LENGTH . ' 字');
        }

        if ($secret) {
            $text = '[secret]' . $text . '[/secret]';
        }

        $db->query(
            $db->update('table.comments')->rows(['text' => $text])->where('coid = ?', $coid)
        );
        self::clearThemeCache();

        return self::parseItem([
            'coid' => $coid,
            'cid' => $cid,
            'created' => (int) $row['created'],
            'author' => (string) $row['author'],
            'authorId' => (int) $row['authorId'],
            'text' => $text,
            'status' => (string) $row['status'],
            'stars' => (int) $row['stars'],
        ]);
    }

    /**
     * 删除说说
     *
     * 只允许删除时光机页面下站长发布的说说，避免误删文章评论。
     *
     * @return array{coid:int,deleted:bool}
     */
    public static function delete(Db $db, int $coid, int $ownerId): array
    {
        $row = $db->fetchRow(
            $db->select('coid', 'cid', 'authorId', 'type')
                ->from('table.comments')->where('coid = ?', $coid)->limit(1)
        );

        if (!$row) {
            throw new \RuntimeException('说说不存在');
        }

        $cid = self::pageId($db);

        if (
            $cid <= 0
            || (int) $row['cid'] !== $cid
            || (string) $row['type'] !== 'comment'
            || (int) $row['authorId'] !== max(1, $ownerId)
        ) {
            throw new \RuntimeException('只能删除时光机里的说说');
        }

        $db->query($db->delete('table.comments')->where('coid = ?', $coid));
        self::recount($db, $cid);
        self::clearThemeCache();

        return ['coid' => $coid, 'deleted' => true];
    }

    /**
     * 时光机页面 cid（slug = cross）
     */
    public static function pageId(Db $db): int
    {
        $row = $db->fetchRow(
            $db->select('cid')->from('table.contents')
                ->where('slug = ?', self::PAGE_SLUG)
                ->where('type = ?', 'page')
                ->where('status = ?', 'publish')
                ->limit(1)
        );

        return $row ? (int) $row['cid'] : 0;
    }

    // ─── 内部方法 ──────────────────────────────────────────────────────────

    /**
     * 把评论行转成客户端可直接渲染的说说
     *
     * @return array{coid:int,cid:int,created:int,author:string,authorId:int,text:string,plain:string,images:array,secret:bool,stars:int}
     */
    private static function parseItem(array $row): array
    {
        $text = (string) $row['text'];
        $secret = false;

        if (preg_match('/\[secret\]([\s\S]*?)\[\/secret\]/i', $text, $match)) {
            $secret = true;
            $text = $match[1];
        }

        $images = [];

        // Markdown 图片：![说明](地址 "标题")
        if (preg_match_all('/!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/', $text, $matches)) {
            $images = $matches[1];
        }

        // 兼容主题里直接贴的 <img src="...">
        if (preg_match_all('/<img[^>]+src=["\']([^"\']+)["\']/i', $text, $matches)) {
            $images = array_merge($images, $matches[1]);
        }

        $images = array_values(array_unique(array_filter($images)));

        $plain = preg_replace('/!\[[^\]]*\]\([^)]*\)/', '', $text);
        $plain = preg_replace('/<img[^>]*>/i', '', $plain);
        $plain = trim(strip_tags((string) $plain));

        return [
            'coid' => (int) $row['coid'],
            'cid' => (int) $row['cid'],
            'created' => (int) $row['created'],
            'author' => (string) $row['author'],
            'authorId' => (int) $row['authorId'],
            'text' => trim($text),
            'plain' => $plain,
            'images' => $images,
            'secret' => $secret,
            'stars' => (int) ($row['stars'] ?? 0),
        ];
    }

    /**
     * 重算页面评论数
     */
    private static function recount(Db $db, int $cid): int
    {
        $num = (int) $db->fetchObject(
            $db->select(['COUNT(coid)' => 'num'])->from('table.comments')
                ->where('status = ? AND cid = ?', 'approved', $cid)
        )->num;

        $db->query($db->update('table.contents')->rows(['commentsNum' => $num])->where('cid = ?', $cid));

        return $num;
    }

    /**
     * 清理主题的「那年今日」缓存
     *
     * 主题把 cross 键缓存到当天 23:59，不清的话网页要等缓存过期才显示新说说。
     * 缓存只是加速手段，类不存在或清理失败都不影响发布结果。
     */
    private static function clearThemeCache(): void
    {
        $file = __TYPECHO_ROOT_DIR__ . __TYPECHO_PLUGIN_DIR__
            . '/Handsome/cache/driver/controller/cache_util.php';

        if (!is_file($file)) {
            return;
        }

        try {
            require_once $file;

            if (class_exists('\\CacheUtil')) {
                $cache = new \CacheUtil(null, false);
                $cache->cacheClearByKey('cross');
            }
        } catch (\Throwable $e) {
            error_log('[SxlbPublisher] 清理时光机缓存失败: ' . $e->getMessage());
        }
    }

    /**
     * 取站长账号，优先使用插件配置的作者，缺失时回落到第一个用户
     *
     * @return array{uid:int,name:string,screenName:string,mail:string,url:string}
     */
    private static function adminUser(Db $db, int $authorId): array
    {
        $user = null;

        if ($authorId > 0) {
            $user = $db->fetchRow(
                $db->select('uid', 'name', 'screenName', 'mail', 'url')
                    ->from('table.users')->where('uid = ?', $authorId)->limit(1)
            );
        }

        if (!$user) {
            $user = $db->fetchRow(
                $db->select('uid', 'name', 'screenName', 'mail', 'url')
                    ->from('table.users')->order('uid', Db::SORT_ASC)->limit(1)
            );
        }

        if (!$user) {
            throw new \RuntimeException('找不到可用的作者账号');
        }

        return [
            'uid' => (int) $user['uid'],
            'name' => (string) $user['name'],
            'screenName' => (string) $user['screenName'],
            'mail' => (string) $user['mail'],
            'url' => (string) $user['url'],
        ];
    }
}
