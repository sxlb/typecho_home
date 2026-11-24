<?php

namespace TypechoPlugin\SxlbPublisher;

use Typecho\Db\Query;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 写作接口专用的独立页面编辑组件
 *
 * 与 PostEdit 的区别：页面没有分类 / 标签，但有模板、排序、父页面；
 * 这里只复用 Typecho 的 contents / fields 写入逻辑，鉴权仍由 Action 层完成。
 */
class PageEdit extends \Widget\Contents\Page\Edit
{
    public function execute()
    {
    }

    public function isWriteable(Query $condition): bool
    {
        return true;
    }

    /**
     * 保存页面
     *
     * @param array $contents 页面数据
     * @param array $fields 自定义字段
     * @return int 页面 cid
     */
    public function apiSave(array $contents, array $fields): int
    {
        $cid = (int) ($contents['cid'] ?? 0);
        unset($contents['cid']);

        if ($cid > 0) {
            $prev = $this->db->fetchRow(
                $this->db->select('type')->from('table.contents')->where('cid = ?', $cid)->limit(1)
            );

            if (!$prev || $prev['type'] !== 'page') {
                throw new \RuntimeException('页面不存在或已被删除');
            }

            $this->update($contents, $this->db->sql()->where('cid = ?', $cid));
            $realId = $cid;
        } else {
            $realId = $this->insert($contents);
        }

        if ($realId <= 0) {
            throw new \RuntimeException('页面写入失败');
        }

        $this->applyFields($fields, $realId);

        // 页面只保留当前版本，顺手清掉网页端遗留的修订草稿，避免后台出现重复条目
        $this->deleteRevisions($realId);

        $this->db->fetchRow($this->select()->where('cid = ?', $realId)->limit(1), [$this, 'push']);

        return $realId;
    }

    /**
     * 删除页面（含评论、附件关联、修订草稿与子页面上移）
     */
    public function apiDelete(int $cid): bool
    {
        $row = $this->db->fetchRow($this->select()->where('cid = ?', $cid)->limit(1));

        if (!$row || $row['type'] !== 'page') {
            return false;
        }

        if ((string) $row['slug'] === 'cross') {
            throw new \RuntimeException('时光机页面不能删除，否则说说功能会失效');
        }

        $parent = (int) $row['parent'];

        // 先回填行数据，让 finishDelete 钩子能取到标题与链接
        $this->db->fetchRow($this->select()->where('cid = ?', $cid)->limit(1), [$this, 'push']);

        $this->delete($this->db->sql()->where('cid = ?', $cid));

        $this->db->query($this->db->delete('table.comments')->where('cid = ?', $cid));
        $this->unAttach($cid);
        $this->deleteFields($cid);
        $this->deleteRevisions($cid);

        // 首页如果指向这个页面，恢复为文章列表
        $this->db->query(
            $this->db->update('table.options')
                ->rows(['value' => 'recent'])
                ->where('name = ?', 'frontPage')
                ->where('value = ?', 'page:' . $cid)
        );

        // 子页面上移到被删页面的父级
        $this->update(
            ['parent' => $parent],
            $this->db->sql()->where('parent = ?', $cid)
                ->where('type = ? OR type = ?', 'page', 'page_draft')
        );

        $this->request->setParam('do', 'delete');
        \Typecho\Plugin::factory('Widget_Contents_Page_Edit')->call('finishDelete', $cid, $this);

        return true;
    }

    /**
     * 删除页面关联的修订草稿
     */
    private function deleteRevisions(int $cid): void
    {
        $revisions = $this->db->fetchAll(
            $this->db->select('cid')->from('table.contents')
                ->where('parent = ?', $cid)
                ->where('type = ?', 'revision')
        );

        foreach ($revisions as $revision) {
            $this->deleteContent((int) $revision['cid'], false);
            $this->deleteFields((int) $revision['cid']);
        }
    }
}
