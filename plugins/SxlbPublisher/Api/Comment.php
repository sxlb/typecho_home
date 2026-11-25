<?php

namespace TypechoPlugin\SxlbPublisher\Api;

use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 评论管理
 *
 * 直接操作 comments 表，状态与 Typecho 后台保持一致：
 *   approved 已通过 / waiting 待审核 / spam 垃圾
 * 每次状态变化后重算 contents.commentsNum，避免前台评论数错乱。
 */
class Comment
{
    /**
     * 评论列表
     *
     * @param string $status approved / waiting / spam / all
     * @param int $cid 只查某篇文章下的评论，0 表示不限
     * @param string $keyword 按作者 / 内容 / 文章标题模糊匹配
     * @return array{items: array, total: int, page: int, size: int}
     */
    public static function listing(
        Db $db,
        int $page,
        int $size,
        string $status,
        int $cid = 0,
        string $keyword = ''
    ): array {
        $filter = self::normalizeStatus($status);

        // 统计与列表保持同一口径：都关联 contents，孤儿评论不计入
        $countQuery = $db->select(['COUNT(table.comments.coid)' => 'num'])
            ->from('table.comments')
            ->join('table.contents', 'table.contents.cid = table.comments.cid');
        $rowsQuery = $db->select(
            'table.comments.coid',
            'table.comments.cid',
            'table.comments.created',
            'table.comments.author',
            'table.comments.mail',
            'table.comments.url',
            'table.comments.text',
            'table.comments.status',
            'table.comments.parent',
            'table.comments.type',
            'table.contents.title'
        )
            ->from('table.comments')
            ->join('table.contents', 'table.contents.cid = table.comments.cid')
            ->order('table.comments.coid', Db::SORT_DESC)
            ->page($page, $size);

        self::applyFilter($countQuery, $filter, $cid);
        self::applyFilter($rowsQuery, $filter, $cid);

        // 搜索：作者、内容、所属文章标题，转义 LIKE 通配符避免用户输入 % _ 被当成模式
        $keyword = trim($keyword);

        if ($keyword !== '') {
            $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $keyword) . '%';
            $condition = 'table.comments.author LIKE ? OR table.comments.text LIKE ? OR table.contents.title LIKE ?';

            $countQuery->where($condition, $like, $like, $like);
            $rowsQuery->where($condition, $like, $like, $like);
        }

        $total = (int) $db->fetchObject($countQuery)->num;
        $items = [];

        foreach ($db->fetchAll($rowsQuery) as $row) {
            $items[] = [
                'coid' => (int) $row['coid'],
                'cid' => (int) $row['cid'],
                'title' => htmlspecialchars_decode((string) $row['title'], ENT_QUOTES),
                'author' => (string) $row['author'],
                'mail' => (string) $row['mail'],
                'url' => (string) $row['url'],
                'text' => (string) $row['text'],
                'status' => (string) $row['status'],
                'type' => (string) $row['type'],
                'parent' => (int) $row['parent'],
                'created' => (int) $row['created'],
                'reply' => (int) $row['parent'] > 0,
            ];
        }

        return ['items' => $items, 'total' => $total, 'page' => $page, 'size' => $size];
    }

    /**
     * 标记评论状态
     *
     * @return array{coid:int,status:string,commentsNum:int}
     */
    public static function mark(Db $db, int $coid, string $status): array
    {
        if (!in_array($status, ['approved', 'waiting', 'spam'], true)) {
            throw new \RuntimeException('状态只能是 approved / waiting / spam');
        }

        $row = $db->fetchRow(
            $db->select('coid', 'cid')->from('table.comments')->where('coid = ?', $coid)->limit(1)
        );

        if (!$row) {
            throw new \RuntimeException('评论不存在');
        }

        $db->query($db->update('table.comments')->rows(['status' => $status])->where('coid = ?', $coid));

        return [
            'coid' => $coid,
            'status' => $status,
            'commentsNum' => self::recount($db, (int) $row['cid']),
        ];
    }

    /**
     * 删除评论
     *
     * 与后台一致，只删除当前这一条；有子评论时保留，与 Typecho 原生行为相同。
     *
     * @return array{coid:int,deleted:bool}
     */
    public static function delete(Db $db, int $coid): array
    {
        $row = $db->fetchRow(
            $db->select('coid', 'cid')->from('table.comments')->where('coid = ?', $coid)->limit(1)
        );

        if (!$row) {
            throw new \RuntimeException('评论不存在');
        }

        $db->query($db->delete('table.comments')->where('coid = ?', $coid));
        self::recount($db, (int) $row['cid']);

        return ['coid' => $coid, 'deleted' => true];
    }

    /**
     * 以站长身份回复评论
     *
     * @return array{coid:int,parent:int,cid:int,author:string,text:string,created:int,status:string}
     */
    public static function reply(
        Db $db,
        int $parent,
        string $text,
        int $authorId,
        string $ip = '',
        string $agent = ''
    ): array {
        $text = trim($text);

        if ($text === '') {
            throw new \RuntimeException('回复内容不能为空');
        }

        // comments.text 是 TEXT（65535 字节），按字节兜底避免超长写入失败
        if (strlen($text) > 65000) {
            throw new \RuntimeException('回复内容过长，请精简后再发');
        }

        $target = $db->fetchRow(
            $db->select('coid', 'cid', 'ownerId')->from('table.comments')->where('coid = ?', $parent)->limit(1)
        );

        if (!$target) {
            throw new \RuntimeException('被回复的评论不存在');
        }

        $user = self::adminUser($db, $authorId);
        $created = time();

        $comment = [
            'cid' => (int) $target['cid'],
            'created' => $created,
            'author' => (string) ($user['screenName'] !== '' ? $user['screenName'] : $user['name']),
            'authorId' => (int) $user['uid'],
            'ownerId' => (int) $target['ownerId'] > 0 ? (int) $target['ownerId'] : (int) $user['uid'],
            'mail' => (string) $user['mail'],
            'url' => (string) $user['url'],
            'ip' => $ip,
            // comments.agent 是 varchar(511)：超长 UA 会溢出或被截断
            'agent' => mb_substr($agent !== '' ? $agent : 'SxlbPublisher', 0, 255),
            'text' => $text,
            'type' => 'comment',
            'status' => 'approved',
            'parent' => $parent,
        ];

        $coid = (int) $db->query($db->insert('table.comments')->rows($comment));
        self::recount($db, (int) $target['cid']);

        return [
            'coid' => $coid,
            'parent' => $parent,
            'cid' => (int) $target['cid'],
            'author' => $comment['author'],
            'text' => $text,
            'created' => $created,
            'status' => 'approved',
        ];
    }

    // ─── 内部方法 ──────────────────────────────────────────────────────────

    private static function normalizeStatus(string $status): ?string
    {
        return in_array($status, ['approved', 'waiting', 'spam'], true) ? $status : null;
    }

    /**
     * @param mixed $query
     */
    private static function applyFilter($query, ?string $status, int $cid): void
    {
        if ($status !== null) {
            $query->where('table.comments.status = ?', $status);
        }

        if ($cid > 0) {
            $query->where('table.comments.cid = ?', $cid);
        }
    }

    /**
     * 重算文章的已通过评论数
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
