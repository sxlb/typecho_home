<?php

namespace TypechoPlugin\SxlbPublisher;

use Typecho\Config;
use Typecho\Db;
use Typecho\Widget;
use TypechoPlugin\SxlbPublisher\Api\Admin;
use TypechoPlugin\SxlbPublisher\Api\Album;
use TypechoPlugin\SxlbPublisher\Api\Calendar;
use TypechoPlugin\SxlbPublisher\Api\Comment;
use TypechoPlugin\SxlbPublisher\Api\Links;
use TypechoPlugin\SxlbPublisher\Api\Media;
use TypechoPlugin\SxlbPublisher\Api\Meta;
use TypechoPlugin\SxlbPublisher\Api\Page;
use TypechoPlugin\SxlbPublisher\Api\Post;
use TypechoPlugin\SxlbPublisher\Api\Stats;
use TypechoPlugin\SxlbPublisher\Api\Shuoshuo;
use TypechoPlugin\SxlbPublisher\Api\Upload;
use Widget\ActionInterface;
use Widget\Options;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 接口分发与鉴权
 *
 * 所有请求都必须带三个请求头：
 *   X-Sxlb-Token  客户端标识
 *   X-Sxlb-Ts     Unix 秒
 *   X-Sxlb-Sign   HMAC_SHA256(secret, ts + "\n" + path + "\n" + rawBody)
 *
 * 未通过签名校验的请求一律 401，不区分 token 错误与签名错误，避免被探测。
 */
class Action extends Widget implements ActionInterface
{
    /** 时间戳允许的最大偏差（秒） */
    private const MAX_SKEW = 300;

    /** 允许跨域的前端来源（仅用于浏览器调试，App 走原生请求） */
    private const CORS_ORIGINS = [
        'http://localhost',
        'https://localhost',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'capacitor://localhost',
    ];

    private Config $config;

    /** 解析后的 JSON body */
    private array $body = [];

    public function execute()
    {
    }

    public function action()
    {
    }

    /**
     * 路由入口
     */
    public function index()
    {
        $this->config = Options::alloc()->plugin('SxlbPublisher');

        $this->sendCors();

        if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
            $this->setStatus(204);
            exit;
        }

        $action = (string) $this->request->get('action', '');
        $sub = (string) $this->request->get('do', '');

        try {
            $this->authorize($action, $sub);
        } catch (\Throwable $e) {
            $this->fail($e->getMessage(), 401);
        }

        // 管理接口需要额外开关，避免只拿到 Token 就能改插件配置
        if ($action === 'admin' && (string) ($this->config->adminEnabled ?? '0') !== '1') {
            $this->fail('管理接口未开启，请在插件设置中开启', 403);
        }

        try {
            switch ($action) {
                case 'ping':
                    $this->ping();
                    break;
                case 'posts':
                    $this->posts();
                    break;
                case 'post':
                    $this->post();
                    break;
                case 'save':
                    $this->save();
                    break;
                case 'upload':
                    $this->upload();
                    break;
                case 'metas':
                    $this->metas();
                    break;
                case 'meta':
                    $this->meta();
                    break;
                case 'delete':
                    $this->delete();
                    break;
                case 'postBatch':
                    $this->postBatch();
                    break;
                case 'summary':
                    $this->summary();
                    break;
                case 'shuoshuo':
                    $this->shuoshuo();
                    break;
                case 'shuoshuoCreate':
                    $this->shuoshuoCreate();
                    break;
                case 'shuoshuoUpdate':
                    $this->shuoshuoUpdate();
                    break;
                case 'shuoshuoDelete':
                    $this->shuoshuoDelete();
                    break;
                case 'pages':
                    $this->pages();
                    break;
                case 'page':
                    $this->page();
                    break;
                case 'pageSave':
                    $this->pageSave();
                    break;
                case 'pageDelete':
                    $this->pageDelete();
                    break;
                case 'links':
                    $this->links();
                    break;
                case 'linkSave':
                    $this->linkSave();
                    break;
                case 'linkDelete':
                    $this->linkDelete();
                    break;
                case 'stats':
                    $this->stats();
                    break;
                case 'visitors':
                    $this->visitors();
                    break;
                case 'album':
                    $this->album();
                    break;
                case 'media':
                    $this->media();
                    break;
                case 'calendar':
                    $this->calendar();
                    break;
                case 'admin':
                    $this->admin($sub);
                    break;
                default:
                    $this->fail('未知接口: ' . $action, 404);
            }
        } catch (\Throwable $e) {
            $this->fail($this->safeMessage($e), 500);
        }
    }

    // ─── 鉴权与请求解析 ────────────────────────────────────────────────────

    /**
     * 校验时间戳与 HMAC 签名
     *
     * @throws \RuntimeException
     */
    private function authorize(string $action, string $sub)
    {
        $token = (string) $this->request->getHeader('X-Sxlb-Token');
        $ts = (string) $this->request->getHeader('X-Sxlb-Ts');
        $nonce = (string) $this->request->getHeader('X-Sxlb-Nonce');
        $sign = (string) $this->request->getHeader('X-Sxlb-Sign');

        $expectedToken = (string) ($this->config->apiToken ?? '');
        $secret = (string) ($this->config->apiSecret ?? '');

        if ($expectedToken === '' || $secret === '') {
            throw new \RuntimeException('插件尚未配置 Token / Secret');
        }

        if ($token === '' || $ts === '' || $sign === '') {
            throw new \RuntimeException('缺少鉴权请求头');
        }

        if (!preg_match('/^[A-Za-z0-9]{32}$/', $nonce)) {
            throw new \RuntimeException('缺少或非法的请求随机串');
        }

        if (!ctype_digit($ts) || abs(time() - (int) $ts) > self::MAX_SKEW) {
            throw new \RuntimeException('时间戳无效或已过期');
        }

        $raw = $this->readRawBody();
        $path = '/writer-api/' . $action . ($sub !== '' ? '/' . $sub : '');
        $query = (string) ($_SERVER['QUERY_STRING'] ?? '');
        // query 一并纳入签名，避免鉴权通过后篡改 page / status / cid 等参数
        $message = $ts . "\n" . $nonce . "\n" . $path . ($query !== '' ? '?' . $query : '') . "\n" . $raw;
        $expected = hash_hmac('sha256', $message, $secret);

        if (!hash_equals($expected, strtolower($sign)) || !hash_equals($expectedToken, $token)) {
            throw new \RuntimeException('签名校验失败');
        }

        // 签名有效但请求重复：拒绝重放（防止截获的删除类请求被二次执行）
        $this->assertUnusedNonce($nonce);
    }

    /**
     * 校验随机串是否首次使用
     *
     * 用临时文件做一次性标记，创建采用独占模式（fopen x），并发下只有一个请求能成功。
     * 标记在时间窗口两倍后过期，由随机触发的清理任务删除。
     *
     * @throws \RuntimeException
     */
    private function assertUnusedNonce(string $nonce): void
    {
        $dir = rtrim(sys_get_temp_dir(), '/\\') . '/sxlb-nonce';

        if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new \RuntimeException('防重放缓存目录不可写');
        }

        $now = time();

        // 每 20 次请求抽一次清理，避免每个请求都遍历目录
        if (random_int(1, 20) === 1) {
            foreach ((array) glob($dir . '/*') as $file) {
                if (is_file($file) && $now - (int) filemtime($file) > self::MAX_SKEW * 2) {
                    @unlink($file);
                }
            }
        }

        $handle = @fopen($dir . '/' . hash('sha256', $nonce), 'x');

        if ($handle === false) {
            throw new \RuntimeException('请求已被处理，请勿重复提交');
        }

        fclose($handle);
    }

    /**
     * 读取原始请求体
     *
     * multipart/form-data 的原始体在 PHP 中不可读，上传接口约定对空串签名。
     */
    private function readRawBody(): string
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));

        if ($method !== 'POST' || strpos($contentType, 'multipart/form-data') !== false) {
            return '';
        }

        $raw = file_get_contents('php://input');

        if ($raw === false) {
            return '';
        }

        if ($raw !== '' && strpos($contentType, 'application/json') !== false) {
            $decoded = json_decode($raw, true);

            if (!is_array($decoded)) {
                throw new \RuntimeException('请求体不是合法的 JSON 对象');
            }

            $this->body = $decoded;
        }

        return $raw;
    }

    /**
     * 生成可返回给客户端的错误信息
     *
     * 插件主动抛出的 RuntimeException 视为业务提示，可直接展示；
     * 数据库异常与其它运行时异常写入站点日志，对外只返回通用文案，避免泄露 SQL 与路径。
     */
    private function safeMessage(\Throwable $e): string
    {
        if ($e instanceof \RuntimeException && !($e instanceof \Typecho\Db\Exception)) {
            return $e->getMessage();
        }

        error_log('[SxlbPublisher] ' . get_class($e) . ': ' . $e->getMessage());

        return '服务器内部错误，请查看站点错误日志';
    }

    /**
     * 取参数：JSON body 优先，其次 query / form
     *
     * @param mixed $default
     * @return mixed
     */
    private function param(string $key, $default = null)
    {
        if (array_key_exists($key, $this->body)) {
            return $this->body[$key];
        }

        return $this->request->get($key, $default);
    }

    private function intParam(string $key, int $default = 0): int
    {
        $value = $this->param($key, $default);

        return is_numeric($value) ? (int) $value : $default;
    }

    // ─── 接口实现 ──────────────────────────────────────────────────────────

    private function ping()
    {
        $this->ok([
            'pong' => true,
            'site' => (string) Options::alloc()->title,
            'version' => Plugin::VERSION,
            'time' => time(),
        ]);
    }

    private function posts()
    {
        $goods = Post::listing(
            Db::get(),
            max(1, $this->intParam('page', 1)),
            min(50, max(1, $this->intParam('size', 20))),
            (string) $this->param('status', ''),
            (string) $this->param('keyword', ''),
            $this->intParam('mid')
        );

        $this->ok($goods);
    }

    private function post()
    {
        $cid = $this->intParam('cid');

        if ($cid <= 0) {
            $this->fail('缺少 cid');
        }

        $data = Post::detail(Db::get(), $cid);

        if ($data === null) {
            $this->fail('文章不存在', 404);
        }

        $this->ok($data);
    }

    private function save()
    {
        if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            $this->fail('save 仅支持 POST', 405);
        }

        $result = Post::save($this->body, $this->config);

        $this->ok($result);
    }

    private function upload()
    {
        if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            $this->fail('upload 仅支持 POST', 405);
        }

        $cid = $this->intParam('cid');
        $result = Upload::handle($cid, max(1, (int) ($this->config->authorId ?? 1)));

        $this->ok($result);
    }

    private function metas()
    {
        $type = (string) $this->param('type', '');

        $this->ok(Meta::listing(Db::get(), $type));
    }

    private function meta()
    {
        $this->requirePost('meta');

        $name = trim((string) $this->param('name', ''));
        $type = (string) $this->param('type', 'tag');

        if ($name === '') {
            $this->fail('缺少名称');
        }

        if (!in_array($type, ['category', 'tag'], true)) {
            $this->fail('type 只能是 category 或 tag');
        }

        $this->ok(Meta::create(Db::get(), $name, $type, $this->intParam('parent')));
    }

    private function delete()
    {
        $this->requirePost('delete');

        $cid = $this->intParam('cid');

        if ($cid <= 0) {
            $this->fail('缺少 cid');
        }

        /** @var PostEdit $edit */
        $edit = Widget::widget(PostEdit::class, null, ['do' => 'delete', 'cid' => $cid]);

        if (!$edit->apiDelete($cid)) {
            $this->fail('文章不存在', 404);
        }

        $this->ok(['cid' => $cid, 'deleted' => true]);
    }

    /**
     * 批量发布 / 转草稿
     *
     * 发布后主题的静态缓存不会自动失效（绕过了 finishPublish 钩子），
     * 这里尝试清理一次，失败也不影响状态更新本身。
     */
    private function postBatch()
    {
        $this->requirePost('postBatch');

        $cids = $this->param('cids', []);

        if (!is_array($cids)) {
            $this->fail('cids 必须是数组');
        }

        $status = (string) $this->param('status', '');
        $result = Post::batchStatus(Db::get(), $cids, $status);

        if ($result['count'] > 0 && $status === 'publish') {
            try {
                Admin::clearCache();
                $result['cacheCleared'] = true;
            } catch (\Throwable $e) {
                // 主题没有缓存工具时忽略，不影响批量发布结果
                $result['cacheCleared'] = false;
            }
        }

        $this->ok($result);
    }

    private function summary()
    {
        $this->requirePost('summary');

        $cid = $this->intParam('cid');
        $force = (bool) $this->param('force', false);

        if ($cid <= 0) {
            $this->fail('缺少 cid');
        }

        $class = '\\TypechoPlugin\\SxlbAI\\SummaryModule';

        if (!class_exists($class)) {
            $this->fail('SxlbAI 插件未启用，无法生成摘要');
        }

        $generated = $class::generateFor($cid, $force);
        $db = Db::get();
        $row = $db->fetchRow($db->select('str_value')->from('table.fields')
            ->where('cid = ?', $cid)->where('name = ?', 'summary'));

        $this->ok([
            'cid' => $cid,
            'generated' => (bool) $generated,
            'summary' => $row ? (string) $row['str_value'] : '',
        ]);
    }

    // ─── 时光机（说说） ────────────────────────────────────────────────────

    private function shuoshuo()
    {
        $this->ok(Shuoshuo::listing(
            Db::get(),
            max(1, $this->intParam('page', 1)),
            min(50, max(1, $this->intParam('size', 20)))
        ));
    }

    private function shuoshuoCreate()
    {
        $this->requirePost('shuoshuoCreate');

        $result = Shuoshuo::create(
            Db::get(),
            (string) $this->param('text', ''),
            (bool) $this->param('secret', false),
            max(1, (int) ($this->config->authorId ?? 1)),
            (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
            (string) ($_SERVER['HTTP_USER_AGENT'] ?? '')
        );

        $this->ok($result);
    }

    private function shuoshuoUpdate()
    {
        $this->requirePost('shuoshuoUpdate');

        $coid = $this->intParam('coid');

        if ($coid <= 0) {
            $this->fail('缺少 coid');
        }

        $this->ok(Shuoshuo::update(
            Db::get(),
            $coid,
            (string) $this->param('text', ''),
            (bool) $this->param('secret', false)
        ));
    }

    private function shuoshuoDelete()
    {
        $this->requirePost('shuoshuoDelete');

        $coid = $this->intParam('coid');

        if ($coid <= 0) {
            $this->fail('缺少 coid');
        }

        $this->ok(Shuoshuo::delete(Db::get(), $coid));
    }

    // ─── 独立页面 ──────────────────────────────────────────────────────────

    private function pages()
    {
        $this->ok(Page::listing(
            Db::get(),
            max(1, $this->intParam('page', 1)),
            min(50, max(1, $this->intParam('size', 30)))
        ));
    }

    private function page()
    {
        $cid = $this->intParam('cid');

        if ($cid <= 0) {
            $this->fail('缺少 cid');
        }

        $data = Page::detail(Db::get(), $cid);

        if ($data === null) {
            $this->fail('页面不存在', 404);
        }

        $this->ok($data);
    }

    private function pageSave()
    {
        $this->requirePost('pageSave');
        $this->ok(Page::save($this->body, $this->config));
    }

    private function pageDelete()
    {
        $this->requirePost('pageDelete');

        $cid = $this->intParam('cid');

        if ($cid <= 0) {
            $this->fail('缺少 cid');
        }

        $this->ok(Page::delete($cid));
    }

    // ─── 友情链接 ──────────────────────────────────────────────────────────

    private function links()
    {
        $this->ok(Links::listing(Db::get()));
    }

    private function linkSave()
    {
        $this->requirePost('linkSave');
        $this->ok(Links::save(Db::get(), $this->body));
    }

    private function linkDelete()
    {
        $this->requirePost('linkDelete');

        $lid = $this->intParam('lid');

        if ($lid <= 0) {
            $this->fail('缺少链接 ID');
        }

        $this->ok(Links::delete(Db::get(), $lid));
    }

    // ─── 数据看板 ──────────────────────────────────────────────────────────

    private function stats()
    {
        $this->ok(Stats::dashboard(Db::get(), $this->intParam('days', 14)));
    }

    /**
     * 访客明细
     *
     * 只读接口，range 支持 today / yesterday / 7d / 30d，按页返回访问记录。
     */
    private function visitors()
    {
        $this->ok(Stats::visitors(
            Db::get(),
            (string) $this->param('range', 'today'),
            $this->intParam('page', 1)
        ));
    }

    /**
     * 相册：主题里分类 slug 为 image 的文章
     */
    private function album()
    {
        $this->ok(Album::listing(
            Db::get(),
            max(1, $this->intParam('page', 1)),
            min(30, max(1, $this->intParam('size', 18)))
        ));
    }

    /**
     * 媒体库：编辑器选图用，只读且不需要管理开关
     */
    private function media()
    {
        $this->ok(Media::listing(
            Db::get(),
            max(1, $this->intParam('page', 1)),
            min(50, max(1, $this->intParam('size', 24))),
            $this->intParam('image', 0) === 1
        ));
    }

    /**
     * 发布日历：按月返回文章与按天汇总
     */
    private function calendar()
    {
        $this->ok(Calendar::month(Db::get(), (string) $this->param('month', '')));
    }

    // ─── 管理接口 ──────────────────────────────────────────────────────────

    /**
     * 管理接口分发
     *
     * 读取类接口用 GET，保存类接口强制 POST；具体逻辑在 Api\Admin。
     */
    private function admin(string $sub)
    {
        switch ($sub) {
            case 'overview':
                $this->ok(Admin::overview(Db::get()));
                break;
            case 'metas':
                // 管理工具页的分类 / 标签列表（写作接口的 metas 不带管理开关校验）
                $this->ok(Meta::listing(Db::get(), ''));
                break;
            case 'plugins':
                $this->ok(Admin::plugins());
                break;
            case 'pluginConfig':
                $this->ok(Admin::pluginConfig(trim((string) $this->param('name', ''))));
                break;
            case 'savePluginConfig':
                if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
                    $this->fail('savePluginConfig 仅支持 POST', 405);
                }

                $name = trim((string) $this->param('name', ''));
                $values = $this->param('values', []);

                if (!is_array($values)) {
                    $this->fail('values 必须是对象');
                }

                $this->ok(Admin::savePluginConfig($name, $values));
                break;
            case 'activatePlugin':
                if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
                    $this->fail('activatePlugin 仅支持 POST', 405);
                }

                $this->ok(Admin::activatePlugin(trim((string) $this->param('name', ''))));
                break;
            case 'deactivatePlugin':
                if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
                    $this->fail('deactivatePlugin 仅支持 POST', 405);
                }

                $this->ok(Admin::deactivatePlugin(trim((string) $this->param('name', ''))));
                break;
            case 'siteConfig':
                $this->ok(Admin::siteConfig(trim((string) $this->param('group', ''))));
                break;
            case 'saveSiteConfig':
                if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
                    $this->fail('saveSiteConfig 仅支持 POST', 405);
                }

                $group = trim((string) $this->param('group', ''));
                $values = $this->param('values', []);

                if (!is_array($values)) {
                    $this->fail('values 必须是对象');
                }

                $this->ok(Admin::saveSiteConfig($group, $values));
                break;
            case 'themeConfig':
                $this->ok(Admin::themeConfig());
                break;
            case 'saveThemeConfig':
                if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
                    $this->fail('saveThemeConfig 仅支持 POST', 405);
                }

                $values = $this->param('values', []);

                if (!is_array($values)) {
                    $this->fail('values 必须是对象');
                }

                $this->ok(Admin::saveThemeConfig($values));
                break;
            case 'clearCache':
                if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
                    $this->fail('clearCache 仅支持 POST', 405);
                }

                $this->ok(Admin::clearCache());
                break;
            case 'comments':
                $this->ok(Comment::listing(
                    Db::get(),
                    max(1, $this->intParam('page', 1)),
                    min(50, max(1, $this->intParam('size', 20))),
                    (string) $this->param('status', ''),
                    $this->intParam('cid'),
                    (string) $this->param('keyword', '')
                ));
                break;
            case 'commentApprove':
            case 'commentWaiting':
            case 'commentSpam':
                $this->requirePost($sub);

                $statusMap = [
                    'commentApprove' => 'approved',
                    'commentWaiting' => 'waiting',
                    'commentSpam' => 'spam',
                ];

                $this->ok(Comment::mark(Db::get(), $this->intParam('coid'), $statusMap[$sub]));
                break;
            case 'commentDelete':
                $this->requirePost($sub);
                $this->ok(Comment::delete(Db::get(), $this->intParam('coid')));
                break;
            case 'commentReply':
                $this->requirePost($sub);
                $this->ok(Comment::reply(
                    Db::get(),
                    $this->intParam('coid'),
                    trim((string) $this->param('text', '')),
                    max(1, (int) ($this->config->authorId ?? 1)),
                    (string) $this->request->getIp(),
                    (string) $this->request->getAgent()
                ));
                break;
            case 'media':
                $this->ok(Media::listing(
                    Db::get(),
                    max(1, $this->intParam('page', 1)),
                    min(50, max(1, $this->intParam('size', 24)))
                ));
                break;
            case 'mediaDelete':
                $this->requirePost($sub);
                $this->ok(Media::delete(Db::get(), $this->intParam('cid')));
                break;
            case 'mediaRename':
                $this->requirePost($sub);
                $this->ok(Media::rename(
                    Db::get(),
                    $this->intParam('cid'),
                    (string) $this->param('name', '')
                ));
                break;
            case 'metaSave':
                $this->requirePost($sub);

                $values = $this->param('values', []);

                if (!is_array($values)) {
                    $this->fail('values 必须是对象');
                }

                $this->ok(Meta::save(Db::get(), $this->intParam('mid'), $values));
                break;
            case 'metaDelete':
                $this->requirePost($sub);
                $this->ok(Meta::delete(Db::get(), $this->intParam('mid')));
                break;
            default:
                $this->fail('未知管理接口: ' . $sub, 404);
        }
    }

    /**
     * 写操作统一要求 POST
     */
    private function requirePost(string $name)
    {
        if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
            $this->fail($name . ' 仅支持 POST', 405);
        }
    }

    // ─── 响应 ──────────────────────────────────────────────────────────────

    /**
     * @param mixed $data
     */
    private function ok($data)
    {
        $this->json(['status' => 'success', 'message' => '', 'data' => $data], 200);
    }

    private function fail(string $message, int $status = 400)
    {
        $this->json(['status' => 'error', 'message' => $message, 'data' => null], $status);
    }

    /**
     * @param array $payload
     */
    private function json($payload, int $status)
    {
        $this->setStatus($status);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /**
     * 设置响应状态码
     *
     * Typecho 1.3 在输出缓冲回收时由 \Typecho\Response 单例统一发送响应头，
     * 会把原生 http_response_code() 的结果覆盖回 200，因此必须同时写入该实例。
     */
    private function setStatus(int $status): void
    {
        if (class_exists(\Typecho\Response::class)) {
            \Typecho\Response::getInstance()->setStatus($status);
        }

        http_response_code($status);
    }

    private function sendCors()
    {
        $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');

        if ($origin !== '' && in_array($origin, self::CORS_ORIGINS, true)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Access-Control-Allow-Credentials: true');
        }

        header('Access-Control-Allow-Headers: Content-Type, X-Sxlb-Token, X-Sxlb-Ts, X-Sxlb-Nonce, X-Sxlb-Sign');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Vary: Origin');
    }
}
