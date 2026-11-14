<?php

namespace TypechoPlugin\SxlbPublisher;

use Typecho\Config;
use Typecho\Db;
use Typecho\Widget;
use TypechoPlugin\SxlbPublisher\Api\Admin;
use TypechoPlugin\SxlbPublisher\Api\Meta;
use TypechoPlugin\SxlbPublisher\Api\Post;
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
            http_response_code(204);
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
                case 'summary':
                    $this->summary();
                    break;
                case 'admin':
                    $this->admin($sub);
                    break;
                default:
                    $this->fail('未知接口: ' . $action, 404);
            }
        } catch (\Throwable $e) {
            $this->fail($e->getMessage(), 500);
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
        $sign = (string) $this->request->getHeader('X-Sxlb-Sign');

        $expectedToken = (string) ($this->config->apiToken ?? '');
        $secret = (string) ($this->config->apiSecret ?? '');

        if ($expectedToken === '' || $secret === '') {
            throw new \RuntimeException('插件尚未配置 Token / Secret');
        }

        if ($token === '' || $ts === '' || $sign === '') {
            throw new \RuntimeException('缺少鉴权请求头');
        }

        if (!ctype_digit($ts) || abs(time() - (int) $ts) > self::MAX_SKEW) {
            throw new \RuntimeException('时间戳无效或已过期');
        }

        $raw = $this->readRawBody();
        $path = '/writer-api/' . $action . ($sub !== '' ? '/' . $sub : '');
        $message = $ts . "\n" . $path . "\n" . $raw;
        $expected = hash_hmac('sha256', $message, $secret);

        if (!hash_equals($expected, strtolower($sign)) || !hash_equals($expectedToken, $token)) {
            throw new \RuntimeException('签名校验失败');
        }
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
            (string) $this->param('status', '')
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

    private function summary()
    {
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
            'summary' => $row['str_value'] ?? '',
        ]);
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
            default:
                $this->fail('未知管理接口: ' . $sub, 404);
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
        http_response_code($status);
        header('Content-Type: application/json; charset=UTF-8');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    private function sendCors()
    {
        $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');

        if ($origin !== '' && in_array($origin, self::CORS_ORIGINS, true)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Access-Control-Allow-Credentials: true');
        }

        header('Access-Control-Allow-Headers: Content-Type, X-Sxlb-Token, X-Sxlb-Ts, X-Sxlb-Sign');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Vary: Origin');
    }
}
