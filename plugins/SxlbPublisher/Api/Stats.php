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
 * 内容部分基于现有 contents / comments / metas 表统计，不额外建表：
 *   - 内容总量：已发布、草稿、独立页面、评论、待审核、媒体
 *   - 近 N 天发文与评论趋势
 *   - 分类文章数分布 Top 6
 *
 * 访问部分读取 VisitorStats 插件的 visitor_log 表，表不存在时返回
 * available=false，前端降级展示，不影响看板其它内容。
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
            'visits' => self::visits($db, $days),
        ];
    }

    /**
     * 访问统计
     *
     * 数据来自 VisitorStats 插件写入的 visitor_log 表，time 字段是已按站点时区
     * 格式化的 datetime 字符串，因此查询边界直接用本地日期，不需再做偏移。
     *
     * @return array<string, mixed>
     */
    private static function visits(Db $db, int $days): array
    {
        // 未安装 VisitorStats 或从未采集过数据时优雅降级
        try {
            $db->fetchRow($db->select('id')->from('table.visitor_log')->limit(1));
        } catch (\Throwable $e) {
            return ['available' => false];
        }

        try {
            self::applySiteTimezone();

            $todayStart = date('Y-m-d 00:00:00');
            $since = date('Y-m-d 00:00:00', strtotime('-' . ($days - 1) . ' days'));

            $total = (int) $db->fetchObject(
                $db->select('COUNT(*) AS num')->from('table.visitor_log')
            )->num;

            $today = (int) $db->fetchObject(
                $db->select('COUNT(*) AS num')->from('table.visitor_log')
                    ->where('time >= ?', $todayStart)
            )->num;

            $uv = (int) $db->fetchObject(
                $db->select('COUNT(DISTINCT ip) AS num')->from('table.visitor_log')
            )->num;

            $rows = $db->fetchAll(
                $db->select(
                    'DATE(time) AS day',
                    'COUNT(*) AS pv',
                    'COUNT(DISTINCT ip) AS uv'
                )
                    ->from('table.visitor_log')
                    ->where('time >= ?', $since)
                    ->group('DATE(time)')
            );

            $buckets = [];

            for ($i = 0; $i < $days; $i++) {
                $startLocal = strtotime($since) + $i * 86400;
                $key = date('Y-m-d', $startLocal);
                $buckets[$key] = [
                    'date' => $key,
                    'label' => date('m-d', $startLocal),
                    'pv' => 0,
                    'uv' => 0,
                ];
            }

            foreach ($rows as $row) {
                $key = (string) $row['day'];

                if (isset($buckets[$key])) {
                    $buckets[$key]['pv'] = (int) $row['pv'];
                    $buckets[$key]['uv'] = (int) $row['uv'];
                }
            }

            $pages = $db->fetchAll(
                $db->select('route', 'COUNT(*) AS pv', 'COUNT(DISTINCT ip) AS uv')
                    ->from('table.visitor_log')
                    ->where('time >= ?', $since)
                    ->group('route')
                    ->order('pv', Db::SORT_DESC)
                    ->limit(5)
            );

            return [
                'available' => true,
                'today' => $today,
                'total' => $total,
                'uv' => $uv,
                'trend' => array_values($buckets),
                'pages' => self::hotPages($db, $pages),
            ];
        } catch (\Throwable $e) {
            return ['available' => false];
        }
    }

    /**
     * 热门页面
     *
     * 日志里只存路由（如 /archives/12/），文章路由补充标题，其余原样展示路径。
     *
     * @param array<int, array<string, mixed>> $rows
     * @return array<int, array{title: string, path: string, pv: int, uv: int}>
     */
    private static function hotPages(Db $db, array $rows): array
    {
        $cids = [];

        foreach ($rows as $row) {
            if (preg_match('#^/archives/(\d+)/?$#', (string) $row['route'], $match)) {
                $cids[] = (int) $match[1];
            }
        }

        $titles = [];

        if ($cids) {
            $contents = $db->fetchAll(
                $db->select('cid', 'title')->from('table.contents')
                    ->where('cid IN ?', $cids)
            );

            foreach ($contents as $content) {
                $titles[(int) $content['cid']] = (string) $content['title'];
            }
        }

        $items = [];

        foreach ($rows as $row) {
            $route = (string) $row['route'];
            $title = '';

            if (preg_match('#^/archives/(\d+)/?$#', $route, $match)) {
                $title = $titles[(int) $match[1]] ?? '';
            } elseif ($route === '/' || $route === '') {
                $title = '首页';
            }

            $items[] = [
                'title' => $title,
                'path' => rawurldecode($route === '' ? '/' : $route),
                'pv' => (int) $row['pv'],
                'uv' => (int) $row['uv'],
            ];
        }

        return $items;
    }

    /**
     * 应用站点时区
     *
     * Typecho 的 timezone 选项是秒偏移（本站 28800），PHP 容器通常为 UTC，
     * 不设置会导致「今天」按 UTC 切日。只影响本类内的 date() 计算。
     */
    private static function applySiteTimezone(): void
    {
        $offset = (int) (Options::alloc()->timezone ?: 0);

        if ($offset !== 0) {
            date_default_timezone_set(
                'Etc/GMT' . ($offset > 0 ? '-' : '+') . (int) (abs($offset) / 3600)
            );
        }
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
