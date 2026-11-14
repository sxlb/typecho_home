<?php

namespace TypechoPlugin\SxlbPublisher;

use Typecho\Plugin\PluginInterface;
use Typecho\Widget\Helper\Form;
use Typecho\Widget\Helper\Form\Element\Radio;
use Typecho\Widget\Helper\Form\Element\Text;
use Utils\Helper;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 凉薄博客 · 移动端写作接口
 *
 * 为安卓写作 App 提供带 HMAC 签名的写入接口，所有写操作都走
 * Widget\Contents\Post\Edit，从而完整触发 SxlbSEO / SxlbAI / Handsome
 * 的发布钩子，保证 App 发布与后台手动发布结果一致。
 *
 * @package SxlbPublisher
 * @author 生性凉薄
 * @version 2.2.1
 * @link https://blog.sxlb.xyz
 */
class Plugin implements PluginInterface
{
    public const VERSION = '2.2.1';

    private const ROUTE = 'sxlb_writer';
    private const ROUTE_SUB = 'sxlb_writer_sub';

    /**
     * 激活：注册两条路由
     */
    public static function activate()
    {
        Helper::addRoute(self::ROUTE, '/writer-api/[action]', Action::class, 'index');
        Helper::addRoute(self::ROUTE_SUB, '/writer-api/[action]/[do]', Action::class, 'index');

        return _t('SxlbPublisher 已启用，接口前缀 /writer-api/');
    }

    public static function deactivate()
    {
        Helper::removeRoute(self::ROUTE);
        Helper::removeRoute(self::ROUTE_SUB);
    }

    /**
     * 配置面板
     *
     * Token 仅用于识别客户端，Secret 仅用于签名，二者都不出现在 URL 中。
     * 首次打开设置页时会生成随机默认值，保存后固定。
     */
    public static function config(Form $form)
    {
        $token = new Text(
            'apiToken',
            null,
            bin2hex(random_bytes(16)),
            _t('客户端 Token'),
            _t('32 位随机串，放在请求头 X-Sxlb-Token')
        );
        $form->addInput($token);

        $secret = new Text(
            'apiSecret',
            null,
            bin2hex(random_bytes(32)),
            _t('签名密钥'),
            _t('64 位随机串，用于 HMAC-SHA256 签名，不可泄露')
        );
        $form->addInput($secret);

        $author = new Text(
            'authorId',
            null,
            '1',
            _t('文章作者 UID'),
            _t('App 发布文章时归属的用户，默认 1')
        );
        $form->addInput($author);

        // 管理接口总开关：默认关闭，避免只拿到 Token 就能改插件配置
        $admin = new Radio(
            'adminEnabled',
            ['0' => _t('关闭'), '1' => _t('开启')],
            '0',
            _t('管理接口'),
            _t('开启后 App 可查看站点概览、插件列表并修改插件配置；关闭时管理接口返回 403')
        );
        $form->addInput($admin);
    }

    public static function personalConfig(Form $form)
    {
    }
}
