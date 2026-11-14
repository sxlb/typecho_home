<?php

namespace TypechoPlugin\SxlbPublisher;

use Typecho\Db\Query;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 写作接口专用的文章编辑组件
 *
 * 与后台的区别只有两点：
 * 1. execute() 不做用户权限检查（鉴权已在 Action 层用 HMAC 完成）
 * 2. isWriteable() 永远返回 true（API 上下文是游客，原实现会直接拒绝）
 *
 * 写入顺序与 Typecho 核心 publish() 保持一致：
 * insert/update → 分类 → 标签 → 自定义字段 → 回填行数据。
 */
class PostEdit extends \Widget\Contents\Post\Edit
{
    public function execute()
    {
    }

    public function isWriteable(Query $condition): bool
    {
        return true;
    }

    /**
     * 保存文章
     *
     * @param array $contents 文章数据
     * @param array $fields 自定义字段
     * @param array $categories 分类 mid 集合
     * @param string|null $tags 逗号分隔的标签
     * @return int 文章 cid
     */
    public function apiSave(array $contents, array $fields, array $categories, ?string $tags): int
    {
        $cid = (int) ($contents['cid'] ?? 0);
        unset($contents['cid']);

        $prev = null;

        if ($cid > 0) {
            $prev = $this->db->fetchRow(
                $this->db->select('type', 'status')->from('table.contents')->where('cid = ?', $cid)
            );

            // 文章已被删除（或在别处被彻底移除）时直接失败，
            // 否则 update 影响 0 行也会「成功」，继续写入分类/标签/字段产生孤立数据
            if (!$prev) {
                throw new \RuntimeException('文章不存在或已被删除');
            }
        }

        if ($cid > 0) {
            $this->update($contents, $this->db->sql()->where('cid = ?', $cid));
            $realId = $cid;
        } else {
            $realId = $this->insert($contents);
        }

        if ($realId <= 0) {
            throw new \RuntimeException('文章写入失败');
        }

        $beforeCount = $prev && $prev['type'] === 'post' && $prev['status'] === 'publish';
        $afterCount = ($contents['type'] ?? 'post') === 'post' && ($contents['status'] ?? 'publish') === 'publish';

        $this->setCategories($realId, array_map('intval', $categories), $beforeCount, $afterCount);
        $this->setTags($realId, $tags, $beforeCount, $afterCount);
        $this->applyFields($fields, $realId);

        $this->db->fetchRow($this->select()->where('cid = ?', $realId)->limit(1), [$this, 'push']);

        return $realId;
    }

    /**
     * 删除文章（含分类计数、标签计数、自定义字段、评论、附件关联）
     */
    public function apiDelete(int $cid): bool
    {
        $row = $this->db->fetchRow($this->select()->where('cid = ?', $cid)->limit(1));

        if (!$row) {
            return false;
        }

        $counted = $row['type'] === 'post' && $row['status'] === 'publish';

        // 先回填行数据，让 finishDelete 钩子能取到 type / permalink / categories
        $this->db->fetchRow($this->select()->where('cid = ?', $cid)->limit(1), [$this, 'push']);

        $this->delete($this->db->sql()->where('cid = ?', $cid));
        $this->setCategories($cid, [], $counted, false);
        $this->setTags($cid, null, $counted, false);
        $this->deleteFields($cid);
        $this->db->query($this->db->delete('table.comments')->where('cid = ?', $cid));
        $this->unAttach($cid);

        $this->request->setParam('do', 'delete');
        \Typecho\Plugin::factory('Widget_Contents_Post_Edit')->call('finishDelete', $cid, $this);

        return true;
    }
}
