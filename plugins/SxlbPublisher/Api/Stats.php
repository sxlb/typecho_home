<?php

namespace TypechoPlugin\SxlbPublisher\Api;

use Typecho\Db;
use Widget\Options;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 数据看板
 *
 * 全部基于现有 contents / comments / metas 表统计，不额外建表、不依赖访问日志：
 *   - 内容总量：已发布、草稿、独立页面、评论、待审核、媒体
 *   - 近 N 天发文与评论趋势
 *   - 分类文章数分布 Top 6
 */
class Stats
{
    /**
     * @return array<string, mixed>
     */
    public static function dashboard(Db $db, int $days = 14): array
    {
        $days = min(30, max(7, $days));

        return [
            'totals' => [
                'posts' => self::countContents($db, 'post', 'publish'),
                'drafts' => self::countContents($db, 'post_draft'),
                'pages' => self::countContents($db, 'page'),
                'comments' => self::countComments($db),
                'waiting' => self::countComments($db, 'waiting'),
                'spam' => self::countComments($db, 'spam'),
                'media' => self::countContents($db, 'attachment'),
                'categories' => self::countMetas($db, 'category'),
                'tags' => self::countMetas($db, 'tag'),
            ],
            'days' => $days,
            'trend' => self::trend($db, $days),
            'categories' => self::categoryTop($db),
        ];
    }

    /**
     * 近 N 天每天的发文 / 评论数，按站点时区切日
     *
     * @return array<int, array{date: string, label: string, posts: int, comments: int}>
     */
    private static function trend(Db $db, int $days): array
    {
        // Typecho 的 timezone 选项是秒偏移（如 28800 表示 +8 小时）
        $offset = (int) (Options::alloc()->timezone ?: 0);
        $nowLocal = time() + $offset;
        $todayStartLocal = strtotime('today', $nowLocal);
        $firstStartLocal = $todayStartLocal - ($days - 1) * 86400;
        $since = $firstStartLocal - $offset;

        $buckets = [];

        for ($i = 0; $i < $days; $i++) {
            $startLocal = $firstStartLocal + $i * 86400;
            $key = date('Y-m-d', $startLocal);
            $buckets[$key] = [
                'date' => $key,
                'label' => date('m-d', $startLocal),
                'posts' => 0,
                'comments' => 0,
            ];
        }

        $posts = $db->fetchAll(
            $db->select('created')->from('table.contents')
                ->where('type = ?', 'post')
                ->where('status = ?', 'publish')
                ->where('created >= ?', $since)
        );

        foreach ($posts as $row) {
            $key = date('Y-m-d', (int) $row['created'] + $offset);

            if (isset($buckets[$key])) {
                $buckets[$key]['posts']++;
            }
        }

        $comments = $db->fetchAll(
            $db->select('created')->from('table.comments')
                ->where('status <> ?', 'spam')
                ->where('created >= ?', $since)
        );

        foreach ($comments as $row) {
            $key = date('Y-m-d', (int) $row['created'] + $offset);

            if (isset($buckets[$key])) {
                $buckets[$key]['comments']++;
            }
        }

        return array_values($buckets);
    }

    /**
     * @return array<int, array{name: string, count: int}>
     */
    private static function categoryTop(Db $db, int $limit = 6): array
    {
        $rows = $db->fetchAll(
            $db->select(
                ['table.metas.name' => 'name'],
                ['COUNT(table.relationships.cid)' => 'num']
            )
                ->from('table.metas')
                ->join('table.relationships', 'table.relationships.mid = table.metas.mid')
                ->where('table.metas.type = ?', 'category')
                ->group('table.metas.mid')
        );

        usort($rows, static fn(array $a, array $b): int => (int) $b['num'] <=> (int) $a['num']);

        $items = [];

        foreach (array_slice($rows, 0, $limit) as $row) {
            $items[] = [
                'name' => (string) $row['name'],
                'count' => (int) $row['num'],
            ];
        }

        return $items;
    }

    private static function countContents(Db $db, string $type, ?string $status = null): int
    {
        $query = $db->select(['COUNT(table.contents.cid)' => 'num'])
            ->from('table.contents')
            ->where('type = ?', $type);

        if ($status !== null) {
            $query->where('status = ?', $status);
        }

        return (int) $db->fetchObject($query)->num;
    }

    private static function countComments(Db $db, ?string $status = null): int
    {
        $query = $db->select(['COUNT(table.comments.coid)' => 'num'])->from('table.comments');

        if ($status !== null) {
            $query->where('status = ?', $status);
        }

        return (int) $db->fetchObject($query)->num;
    }

    private static function countMetas(Db $db, string $type): int
    {
        return (int) $db->fetchObject(
            $db->select(['COUNT(table.metas.mid)' => 'num'])->from('table.metas')
                ->where('type = ?', $type)
        )->num;
    }
}
