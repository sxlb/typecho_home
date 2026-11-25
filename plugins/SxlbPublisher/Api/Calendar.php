<?php

namespace TypechoPlugin\SxlbPublisher\Api;

use Typecho\Db;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 发布日历
 *
 * 按月列出文章（含草稿），并按天汇总数量，供客户端画日历与当日清单。
 * 日期边界用站点时区的 mktime 计算，避免与设备时区不一致。
 */
class Calendar
{
    /** 单月最多返回的文章数，超过只取最早的 500 篇 */
    private const MAX_ITEMS = 500;

    /**
     * @param string $month YYYY-MM，非法值回退到当前月
     * @return array{month:string,days:array,items:array,total:int}
     */
    public static function month(Db $db, string $month): array
    {
        if (!preg_match('/^(\d{4})-(\d{2})$/', $month, $match)) {
            $month = date('Y-m');
            $match = [];
        }

        $year = $match ? (int) $match[1] : (int) date('Y');
        $mon = $match ? (int) $match[2] : (int) date('n');

        if ($mon < 1 || $mon > 12) {
            $year = (int) date('Y');
            $mon = (int) date('n');
        }

        $start = mktime(0, 0, 0, $mon, 1, $year);
        $end = mktime(0, 0, 0, $mon + 1, 1, $year);
        $now = time();

        $rows = $db->fetchAll(
            $db->select('cid', 'title', 'slug', 'created', 'type', 'status')
                ->from('table.contents')
                // OR 条件必须自己加括号，否则与后面的时间范围 AND 组合会算错优先级
                ->where('(table.contents.type = ? OR table.contents.type = ?)', 'post', 'post_draft')
                ->where('table.contents.created >= ? AND table.contents.created < ?', $start, $end)
                ->order('table.contents.created', Db::SORT_ASC)
                ->limit(self::MAX_ITEMS)
        );

        $items = [];
        $days = [];

        foreach ($rows as $row) {
            $created = (int) $row['created'];
            $day = date('Y-m-d', $created);
            $status = $row['type'] === 'post_draft'
                ? 'draft'
                : ($created > $now ? 'scheduled' : 'publish');

            $items[] = [
                'cid' => (int) $row['cid'],
                'title' => htmlspecialchars_decode((string) $row['title'], ENT_QUOTES),
                'slug' => (string) $row['slug'],
                'created' => $created,
                // 带上服务端时区下的日期，客户端不需要再换算时区
                'day' => $day,
                'status' => $status,
            ];

            if (!isset($days[$day])) {
                $days[$day] = ['publish' => 0, 'scheduled' => 0, 'draft' => 0];
            }

            $days[$day][$status] += 1;
        }

        return [
            'month' => sprintf('%04d-%02d', $year, $mon),
            'days' => $days,
            'items' => $items,
            'total' => count($items),
        ];
    }
}
