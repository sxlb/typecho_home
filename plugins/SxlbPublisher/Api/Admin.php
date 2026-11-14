<?php

namespace TypechoPlugin\SxlbPublisher\Api;

use Typecho\Db;
use Typecho\Plugin;
use Typecho\Widget\Helper\Form;
use Typecho\Widget\Helper\Form\Element\Text;
use Typecho\Widget\Helper\Form\Element;
use Typecho\Widget\Helper\Form\Element\Checkbox;
use Typecho\Widget\Helper\Form\Element\Fake;
use Typecho\Widget\Helper\Form\Element\Hidden;
use Typecho\Widget\Helper\Form\Element\Number;
use Typecho\Widget\Helper\Form\Element\Password;
use Typecho\Widget\Helper\Form\Element\Radio;
use Typecho\Widget\Helper\Form\Element\Select;
use Typecho\Widget\Helper\Form\Element\Submit;
use Typecho\Widget\Helper\Form\Element\Textarea;
use Typecho\Widget\Helper\Layout;
use Widget\Options;
use Widget\Options\General as GeneralOptions;
use Widget\Plugins\Edit as PluginsEdit;

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

/**
 * 管理接口：站点概览、插件列表、插件配置读写
 *
 * 本类只负责取数与校验，不输出 JSON；所有异常由 Action 统一转成 {status:error}。
 * 插件配置复用 Typecho 自带的 Form，因此能兼容插件自定义的 Text / Select / Radio 等标准元素。
 */
class Admin
{
    /**
     * 站点概览
     *
     * @return array{posts:int,drafts:int,comments:int,pendingComments:int,media:int,site:string,time:int}
     */
    public static function overview(Db $db): array
    {
        return [
            'posts' => self::countContents($db, 'post', 'publish'),
            'drafts' => self::countContents($db, 'post_draft'),
            'comments' => self::countComments($db),
            'pendingComments' => self::countComments($db, 'waiting'),
            'media' => self::countContents($db, 'attachment'),
            'categories' => self::countMetas($db, 'category'),
            'tags' => self::countMetas($db, 'tag'),
            'site' => (string) Options::alloc()->title,
            'time' => time(),
        ];
    }

    /**
     * 插件列表
     *
     * 只返回带合法插件头信息的目录，避免把缓存目录、临时目录当成插件。
     *
     * @return array{items: array}
     */
    public static function plugins(): array
    {
        $activated = Plugin::export()['activated'] ?? [];
        $items = [];

        foreach (glob(self::pluginDir() . '/*') ?: [] as $dir) {
            if (!is_dir($dir)) {
                continue;
            }

            $file = $dir . '/Plugin.php';

            if (!is_file($file)) {
                continue;
            }

            $name = basename($dir);

            try {
                $info = Plugin::parseInfo($file);
            } catch (\Throwable $e) {
                // 插件头信息解析失败时跳过，不影响其它插件
                continue;
            }

            if (($info['title'] ?? '') === '') {
                continue;
            }

            $items[] = [
                'name' => $name,
                'title' => (string) $info['title'],
                'description' => trim((string) $info['description']),
                'version' => (string) $info['version'],
                'author' => (string) $info['author'],
                'active' => isset($activated[$name]),
                'hasConfig' => !empty($info['config']),
                'self' => $name === 'SxlbPublisher',
            ];
        }

        usort($items, static function (array $a, array $b): int {
            if ($a['active'] !== $b['active']) {
                return $a['active'] ? -1 : 1;
            }

            return strcasecmp($a['name'], $b['name']);
        });

        return ['items' => $items];
    }

    /**
     * 读取插件配置表单
     *
     * @return array{name:string,title:string,fields:array}
     */
    public static function pluginConfig(string $name): array
    {
        $name = trim($name);
        [$file, $class, $info] = self::resolve($name);

        require_once $file;
        $form = self::buildForm($class, self::savedValues($name));

        return [
            'name' => $name,
            'title' => (string) $info['title'],
            'fields' => self::serialize($form),
        ];
    }

    /**
     * 保存插件配置
     *
     * Form::getParams() 读取的是 Typecho\Request 单例的 $_POST，
     * 这里把客户端 JSON 的值注入 $_POST，再走官方校验与写入逻辑。
     *
     * @param array $values 客户端提交的 name => value
     * @return array{name:string,title:string,fields:array,saved:bool}
     */
    public static function savePluginConfig(string $name, array $values): array
    {
        $name = trim($name);
        [$file, $class, $info] = self::resolve($name);

        require_once $file;
        $form = self::buildForm($class, self::savedValues($name));

        // 白名单：只接受表单声明过的字段，防止写入任意插件配置
        foreach ($form->getInputs() as $key => $input) {
            if (!array_key_exists($key, $values)) {
                continue;
            }

            $value = $values[$key];

            if ($input instanceof Checkbox) {
                $_POST[$key] = is_array($value) ? array_values(array_map('strval', $value)) : [];
            } elseif (!is_array($value)) {
                $_POST[$key] = (string) $value;
            }
        }

        $errors = $form->validate();

        if (!empty($errors)) {
            $first = reset($errors);
            throw new \RuntimeException(is_string($first) ? $first : '配置校验失败');
        }

        PluginsEdit::configPlugin($name, $form->getAllRequest());

        $form = self::buildForm($class, self::savedValues($name));

        return [
            'name' => $name,
            'title' => (string) $info['title'],
            'saved' => true,
            'fields' => self::serialize($form),
        ];
    }

    /**
     * 启用插件
     *
     * 与 Typecho 后台流程一致，但不触发 goBack 重定向。
     * 停用会保留配置，因此这里只在从未保存过配置时写入默认值。
     *
     * @return array{name:string,active:bool,message:string}
     */
    public static function activatePlugin(string $name): array
    {
        $name = trim($name);
        [$file, $class, $info] = self::pluginFile($name);
        $activated = Plugin::export()['activated'] ?? [];

        if (isset($activated[$name])) {
            throw new \RuntimeException('插件已启用');
        }

        if (!Plugin::checkDependence($info['since'] ?? null)) {
            throw new \RuntimeException('插件依赖的 Typecho 版本不满足');
        }

        require_once $file;

        if (!class_exists($class) || !method_exists($class, 'activate')) {
            throw new \RuntimeException('插件无法启用');
        }

        ob_start();

        try {
            $result = call_user_func([$class, 'activate']);
        } finally {
            ob_end_clean();
        }

        Plugin::activate($name);
        self::savePlugins();

        // 保留配置：只有从未保存过配置时才初始化默认值，避免覆盖用户数据
        if (self::savedValues($name) === []) {
            self::initPluginConfig($name, $class);
        }

        return [
            'name' => $name,
            'active' => true,
            'message' => is_string($result) && $result !== '' ? $result : '插件已启用',
        ];
    }

    /**
     * 停用插件
     *
     * 按需求保留 plugin:<name> / _plugin:<name> 配置，再次启用时原值仍然有效。
     *
     * @return array{name:string,active:bool,configKept:bool,message:string}
     */
    public static function deactivatePlugin(string $name): array
    {
        $name = trim($name);

        if ($name === 'SxlbPublisher') {
            throw new \RuntimeException('不能停用接口插件本身');
        }

        if ($name === '' || preg_match('/^[A-Za-z0-9_\-]+$/', $name) !== 1) {
            throw new \RuntimeException('插件名不合法');
        }

        $activated = Plugin::export()['activated'] ?? [];

        if (!isset($activated[$name])) {
            throw new \RuntimeException('插件未启用');
        }

        try {
            [$file, $class] = Plugin::portal($name, self::pluginDir());
        } catch (\Throwable $e) {
            // 插件文件已被删除时，仍允许清理启用状态
            $file = null;
            $class = null;
        }

        if ($file !== null && is_file($file)) {
            require_once $file;

            if (!class_exists($class) || !method_exists($class, 'deactivate')) {
                throw new \RuntimeException('插件无法停用');
            }

            ob_start();

            try {
                call_user_func([$class, 'deactivate']);
            } catch (\Typecho\Plugin\Exception $e) {
                throw new \RuntimeException($e->getMessage());
            } finally {
                ob_end_clean();
            }
        }

        Plugin::deactivate($name);
        self::savePlugins();

        return [
            'name' => $name,
            'active' => false,
            'configKept' => true,
            'message' => '插件已停用，配置已保留',
        ];
    }

    /**
     * 站点设置：返回分组列表与指定组字段
     *
     * @return array{groups:array,group:string,title:string,saved:bool,fields:array}
     */
    public static function siteConfig(string $group = ''): array
    {
        $group = self::normalizeGroup($group);

        return [
            'groups' => self::siteGroups(),
            'group' => $group,
            'title' => self::groupTitle($group),
            'saved' => false,
            'fields' => self::siteFields($group),
        ];
    }

    /**
     * 保存站点设置
     *
     * @return array{groups:array,group:string,title:string,saved:bool,fields:array}
     */
    public static function saveSiteConfig(string $group, array $values): array
    {
        $group = self::normalizeGroup($group);

        switch ($group) {
            case 'reading':
                self::saveReading($values);
                break;
            case 'discussion':
                self::saveDiscussion($values);
                break;
            case 'permalink':
                self::savePermalink($values);
                break;
            default:
                self::saveGeneral($values);
        }

        $data = self::siteConfig($group);
        $data['saved'] = true;

        return $data;
    }

    /**
     * 当前主题配置
     *
     * @return array{theme:string,title:string,saved:bool,fields:array}
     */
    public static function themeConfig(): array
    {
        $theme = (string) Options::alloc()->theme;
        $form = self::buildThemeForm($theme);
        $saved = self::themeValues($theme);

        foreach ($form->getInputs() as $key => $input) {
            if (array_key_exists($key, $saved)) {
                $input->value($saved[$key]);
            }
        }

        return [
            'theme' => $theme,
            'title' => '主题设置（' . $theme . '）',
            'saved' => false,
            'fields' => self::serialize($form),
        ];
    }

    /**
     * 保存当前主题配置
     *
     * @return array{theme:string,title:string,saved:bool,fields:array}
     */
    public static function saveThemeConfig(array $values): array
    {
        $theme = (string) Options::alloc()->theme;
        $form = self::buildThemeForm($theme);

        // 只接受表单声明过的字段，Checkbox 统一转数组
        foreach ($form->getInputs() as $key => $input) {
            if (!array_key_exists($key, $values)) {
                continue;
            }

            $value = $values[$key];

            if ($input instanceof Checkbox) {
                $_POST[$key] = is_array($value) ? array_values(array_map('strval', $value)) : [];
            } elseif (!is_array($value)) {
                $_POST[$key] = (string) $value;
            }
        }

        $errors = $form->validate();

        if (!empty($errors)) {
            $first = reset($errors);
            throw new \RuntimeException(is_string($first) ? $first : '配置校验失败');
        }

        $settings = $form->getAllRequest();

        if (function_exists('themeConfigHandle')) {
            ob_start();

            try {
                themeConfigHandle($settings, false);
            } finally {
                ob_end_clean();
            }
        } else {
            self::saveOption('theme:' . $theme, json_encode($settings, JSON_UNESCAPED_UNICODE));
        }

        $data = self::themeConfig();
        $data['saved'] = true;

        return $data;
    }

    // ─── 内部实现 ──────────────────────────────────────────────────────────

    private static function pluginDir(): string
    {
        return __TYPECHO_ROOT_DIR__ . '/' . __TYPECHO_PLUGIN_DIR__;
    }

    // ─── 插件启停辅助 ──────────────────────────────────────────────────────

    /**
     * 校验插件名并取回入口文件、类名与头信息
     *
     * 与 resolve() 的区别：不要求插件已启用或带配置表单。
     *
     * @return array{0:string,1:string,2:array}
     */
    private static function pluginFile(string $name): array
    {
        if ($name === '' || preg_match('/^[A-Za-z0-9_\-]+$/', $name) !== 1) {
            throw new \RuntimeException('插件名不合法');
        }

        try {
            [$file, $class] = Plugin::portal($name, self::pluginDir());
        } catch (\Throwable $e) {
            throw new \RuntimeException('插件不存在');
        }

        return [$file, $class, Plugin::parseInfo($file)];
    }

    /**
     * 写入插件默认配置
     *
     * 仅在从未保存过配置时调用；单个插件初始化失败不影响启用结果。
     */
    private static function initPluginConfig(string $name, string $class): void
    {
        foreach ([['config', false], ['personalConfig', true]] as [$method, $personal]) {
            if (!class_exists($class) || !method_exists($class, $method)) {
                continue;
            }

            $form = new Form();

            ob_start();

            try {
                call_user_func([$class, $method], $form);
            } catch (\Throwable $e) {
                // 配置面板依赖运行时上下文时可能失败，此处忽略
                continue;
            } finally {
                ob_end_clean();
            }

            $settings = $form->getValues();

            if (!empty($settings)) {
                PluginsEdit::configPlugin($name, $settings, $personal);
            }
        }
    }

    /**
     * 把当前插件状态写回 options.plugins
     */
    private static function savePlugins(): void
    {
        self::saveOption('plugins', json_encode(Plugin::export(), JSON_UNESCAPED_UNICODE));
    }

    // ─── 站点设置 ──────────────────────────────────────────────────────────

    private static function normalizeGroup(string $group): string
    {
        $group = trim($group);

        return in_array($group, ['general', 'reading', 'discussion', 'permalink'], true) ? $group : 'general';
    }

    /**
     * @return array<int,array{key:string,title:string}>
     */
    private static function siteGroups(): array
    {
        return [
            ['key' => 'general', 'title' => '基础设置'],
            ['key' => 'reading', 'title' => '阅读设置'],
            ['key' => 'discussion', 'title' => '讨论设置'],
            ['key' => 'permalink', 'title' => '固定链接'],
        ];
    }

    private static function groupTitle(string $group): string
    {
        foreach (self::siteGroups() as $item) {
            if ($item['key'] === $group) {
                return $item['title'];
            }
        }

        return '基础设置';
    }

    private static function siteFields(string $group): array
    {
        switch ($group) {
            case 'reading':
                return self::serialize(self::readingForm());
            case 'discussion':
                return self::serialize(self::discussionForm());
            case 'permalink':
                return self::serialize(self::permalinkForm());
            default:
                return self::serialize(self::generalForm());
        }
    }

    private static function generalForm(): Form
    {
        $form = new Form();

        $form->addInput(new Text('title', null, self::optionValue('title') ?? '', '站点名称', '显示在浏览器标题栏和页面标题中'));

        if (!defined('__TYPECHO_SITE_URL__')) {
            $form->addInput(new Text(
                'siteUrl',
                null,
                self::optionValue('siteUrl') ?? '',
                '站点地址',
                '用于生成永久链接，需以 http:// 或 https:// 开头'
            ));
        }

        $form->addInput(new Text('description', null, self::optionValue('description') ?? '', '站点描述', '显示在网页头部的 description 标签'));
        $form->addInput(new Text('keywords', null, self::optionValue('keywords') ?? '', '站点关键词', '多个关键词用英文逗号分隔'));
        $form->addInput(new Radio(
            'allowRegister',
            ['0' => '不允许', '1' => '允许'],
            self::optionValue('allowRegister') ?? '0',
            '是否允许注册',
            '注册用户默认没有写入权限'
        ));
        $form->addInput(new Radio(
            'allowXmlRpc',
            ['0' => '关闭', '1' => '仅关闭 Pingback 接口', '2' => '打开'],
            self::optionValue('allowXmlRpc') ?? '0',
            'XMLRPC 接口',
            '用于离线发布等第三方客户端调用'
        ));

        $langs = GeneralOptions::getLangs();

        if (count($langs) > 1) {
            $form->addInput(new Select('lang', $langs, self::optionValue('lang') ?? '', '语言', '站点默认语言'));
        }

        $form->addInput(new Select(
            'timezone',
            self::timezoneOptions(),
            self::optionValue('timezone') ?? '28800',
            '时区',
            '评论与文章时间按此时区显示'
        ));

        $types = self::attachmentTypes();

        $form->addInput((new Checkbox('attachmentTypes', [
            '@image@' => '图片文件（gif / jpg / png / webp 等）',
            '@media@' => '媒体文件（mp3 / mp4 / flv 等）',
            '@doc@' => '文档文件（doc / ppt / pdf / zip 等）',
        ], $types['selected'], '允许上传的文件类型', '未勾选的类型将无法上传'))->multiMode());

        $form->addInput(new Text(
            'attachmentTypesOther',
            null,
            $types['other'],
            '其它后缀',
            '用英文逗号分隔，例如 cpp, h, mak'
        ));

        return $form;
    }

    /**
     * 拆分已保存的附件类型，供表单单选/复选回填
     *
     * @return array{selected:array,other:string}
     */
    private static function attachmentTypes(): array
    {
        $parts = array_filter(array_map('trim', explode(',', self::optionValue('attachmentTypes') ?? '')));
        $builtin = ['@image@', '@media@', '@doc@'];

        return [
            'selected' => array_values(array_intersect($builtin, $parts)),
            'other' => implode(',', array_diff($parts, $builtin)),
        ];
    }

    private static function readingForm(): Form
    {
        $form = new Form();

        $form->addInput(new Text(
            'postDateFormat',
            null,
            self::optionValue('postDateFormat') ?? 'Y-m-d',
            '文章日期格式',
            '例如 Y-m-d 或 Y年m月d日'
        ));

        $options = ['recent' => '显示最新发布的文章'];
        $db = Db::get();
        $rows = $db->fetchAll(
            $db->select('cid', 'title')->from('table.contents')
                ->where('type = ?', 'page')
                ->where('status = ?', 'publish')
                ->where('created < ?', time())
                ->order('table.contents.order', Db::SORT_ASC)
        );

        foreach ($rows as $row) {
            $options['page:' . $row['cid']] = '使用页面：' . $row['title'];
        }

        $theme = (string) Options::alloc()->theme;

        foreach (glob(Options::alloc()->themeFile($theme, '*.php')) ?: [] as $file) {
            $base = basename($file);

            if ($base === 'index.php') {
                continue;
            }

            $info = Plugin::parseInfo($file);

            if (($info['title'] ?? '') === 'index') {
                $options['file:' . $base] = '使用主题文件：' . $base;
            }
        }

        $current = self::optionValue('frontPage') ?? 'recent';

        if (!isset($options[$current])) {
            $options[$current] = '当前设置（' . $current . '）';
        }

        $form->addInput(new Select('frontPage', $options, $current, '首页显示', '选择首页展示最新文章、指定页面或主题文件'));
        $form->addInput(new Radio(
            'frontArchive',
            ['0' => '不启用', '1' => '启用'],
            self::optionValue('frontArchive') ?? '0',
            '归档路径',
            '首页为页面或文件时，可把文章列表放到归档路径'
        ));
        $form->addInput(new Text(
            'archivePattern',
            null,
            self::decodeRule(self::routingTable()['archive']['url'] ?? ''),
            '文章归档路径',
            '可用 {cid} {slug} {category} {year} {month} {day} 等参数'
        ));
        $form->addInput(new Number(
            'postsListSize',
            null,
            self::optionValue('postsListSize') ?? '10',
            '列表显示文章数',
            '侧边栏等列表处显示的文章数量'
        ));
        $form->addInput(new Number('pageSize', null, self::optionValue('pageSize') ?? '10', '每页文章数', '文章列表每页显示数量'));
        $form->addInput(new Radio(
            'feedFullText',
            ['0' => '摘要', '1' => '全文'],
            self::optionValue('feedFullText') ?? '0',
            'Feed 输出',
            '聚合输出全文或摘要'
        ));

        return $form;
    }

    private static function discussionForm(): Form
    {
        $form = new Form();

        $form->addInput(new Text(
            'commentDateFormat',
            null,
            self::optionValue('commentDateFormat') ?? 'Y-m-d',
            '评论日期格式',
            '例如 Y-m-d 或 Y年m月d日'
        ));
        $form->addInput(new Number(
            'commentsListSize',
            null,
            self::optionValue('commentsListSize') ?? '10',
            '列表显示评论数',
            '侧边栏等列表处显示的评论数量'
        ));
        $form->addInput(new Number(
            'commentsPageSize',
            null,
            self::optionValue('commentsPageSize') ?? '10',
            '每页评论数',
            '评论列表每页显示数量'
        ));
        $form->addInput(new Radio(
            'commentsPageDisplay',
            ['first' => '第一页', 'last' => '最后一页'],
            self::optionValue('commentsPageDisplay') ?? 'first',
            '默认显示',
            '评论分页默认显示哪一页'
        ));
        $form->addInput(new Radio(
            'commentsOrder',
            ['DESC' => '新评论在前', 'ASC' => '旧评论在前'],
            self::optionValue('commentsOrder') ?? 'DESC',
            '评论排序',
            '评论列表的排列顺序'
        ));
        $form->addInput(new Number(
            'commentsMaxNestingLevels',
            null,
            self::optionValue('commentsMaxNestingLevels') ?? '5',
            '最大回复层数',
            '允许评论嵌套的最大层数，范围 2-7'
        ));
        $form->addInput(new Select(
            'commentsAvatarRating',
            ['G' => 'G', 'PG' => 'PG', 'R' => 'R', 'X' => 'X'],
            self::optionValue('commentsAvatarRating') ?? 'G',
            '头像最高评级',
            '超过此评级的头像将不被显示'
        ));

        $showOptions = [
            'commentsShowCommentOnly' => '仅显示评论，不显示 Pingback 和 Trackback',
            'commentsMarkdown' => '评论可使用 Markdown 语法',
            'commentsShowUrl' => '显示评论作者主页',
            'commentsUrlNofollow' => '评论作者主页添加 nofollow',
            'commentsAvatar' => '显示评论头像',
            'commentsPageBreak' => '启用评论分页',
            'commentsThreaded' => '启用评论回复',
        ];
        $postOptions = [
            'commentsRequireModeration' => '评论必须经过审核',
            'commentsWhitelist' => '仅允许已审核用户评论',
            'commentsRequireMail' => '评论必须填写邮箱',
            'commentsRequireUrl' => '评论必须填写网址',
            'commentsCheckReferer' => '检查评论来源',
            'commentsAntiSpam' => '启用评论反垃圾',
            'commentsAutoClose' => '自动关闭评论',
            'commentsPostIntervalEnable' => '限制同 IP 评论间隔',
        ];

        $form->addInput((new Checkbox(
            'commentsShow',
            $showOptions,
            self::checkedValues($showOptions),
            '评论显示',
            '勾选需要的评论显示选项'
        ))->multiMode());
        $form->addInput((new Checkbox(
            'commentsPost',
            $postOptions,
            self::checkedValues($postOptions),
            '评论提交',
            '勾选需要的评论提交限制'
        ))->multiMode());

        $timeout = (int) (self::optionValue('commentsPostTimeout') ?? 0);
        $interval = (int) (self::optionValue('commentsPostInterval') ?? 0);

        $form->addInput(new Number(
            'commentsPostTimeout',
            null,
            (string) (int) round($timeout / 86400),
            '自动关闭评论',
            '文章发表多少天后关闭评论，0 表示不关闭'
        ));
        $form->addInput(new Number(
            'commentsPostInterval',
            null,
            (string) round($interval / 60, 1),
            '同 IP 评论间隔',
            '单位分钟，0 表示不限制'
        ));
        $form->addInput(new Textarea(
            'commentsHTMLTagAllowed',
            null,
            self::optionValue('commentsHTMLTagAllowed') ?? '',
            '允许的 HTML 标签',
            '例如 <a><img><blockquote>'
        ));

        return $form;
    }

    /**
     * 取已开启的复选项
     *
     * @param array $options 字段名 => 标签
     * @return array
     */
    private static function checkedValues(array $options): array
    {
        $values = [];

        foreach (array_keys($options) as $key) {
            if ((string) self::optionValue($key) === '1') {
                $values[] = $key;
            }
        }

        return $values;
    }

    private static function permalinkForm(): Form
    {
        $form = new Form();

        if (!defined('__TYPECHO_REWRITE__')) {
            $form->addInput(new Radio(
                'rewrite',
                ['0' => '不启用', '1' => '启用'],
                self::optionValue('rewrite') ?? '0',
                '地址重写',
                '启用前请确认服务器已配置 rewrite，否则文章链接会 404'
            ));
        }

        $table = self::routingTable();
        $current = $table['post']['url'] ?? '/archives/[cid:digital]/';
        $patterns = [
            '/archives/[cid:digital]/' => '默认风格（/archives/{cid}/）',
            '/archives/[slug].html' => 'WordPress 风格（/archives/{slug}.html）',
            '/[year:digital:4]/[month:digital:2]/[day:digital:2]/[slug].html' => '按日期归档（/{year}/{month}/{day}/{slug}.html）',
            '/[category]/[slug].html' => '按分类归档（/{category}/{slug}.html）',
            'custom' => '个性化定义',
        ];
        $custom = !isset($patterns[$current]);

        $form->addInput(new Select(
            'postPattern',
            $patterns,
            $custom ? 'custom' : $current,
            '文章路径',
            '一旦选定请勿轻易修改，避免旧链接失效'
        ));
        $form->addInput(new Text(
            'customPattern',
            null,
            $custom ? self::decodeRule($current) : '',
            '自定义文章路径',
            '例如 /archives/{cid}/，可用 {cid} {slug} {category} {directory} {year} {month} {day}'
        ));
        $form->addInput(new Text(
            'pagePattern',
            null,
            self::decodeRule($table['page']['url'] ?? '/{slug}.html'),
            '独立页面路径',
            '必须包含 {slug}、{cid} 或 {directory} 之一'
        ));
        $form->addInput(new Text(
            'categoryPattern',
            null,
            self::decodeRule($table['category']['url'] ?? '/category/{slug}/'),
            '分类路径',
            '必须包含 {slug}、{mid} 或 {directory} 之一'
        ));

        return $form;
    }

    private static function saveGeneral(array $values): void
    {
        $settings = [];

        $title = self::pick($values, 'title', '');

        if ($title === '') {
            throw new \RuntimeException('站点名称不能为空');
        }

        $settings['title'] = $title;

        if (!defined('__TYPECHO_SITE_URL__') && array_key_exists('siteUrl', $values)) {
            $url = self::pick($values, 'siteUrl', '');
            $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));

            if ($url === '' || filter_var($url, FILTER_VALIDATE_URL) === false || !in_array($scheme, ['http', 'https'], true)) {
                throw new \RuntimeException('站点地址必须是合法的 http/https URL');
            }

            $settings['siteUrl'] = rtrim($url, '/');
        }

        if (array_key_exists('description', $values)) {
            $settings['description'] = self::pick($values, 'description', '');
        }

        if (array_key_exists('keywords', $values)) {
            $settings['keywords'] = self::pick($values, 'keywords', '');
        }

        if (array_key_exists('allowRegister', $values)) {
            $value = self::pick($values, 'allowRegister', '0');

            if (!in_array($value, ['0', '1'], true)) {
                throw new \RuntimeException('注册开关取值不合法');
            }

            $settings['allowRegister'] = $value;
        }

        if (array_key_exists('allowXmlRpc', $values)) {
            $value = self::pick($values, 'allowXmlRpc', '0');

            if (!in_array($value, ['0', '1', '2'], true)) {
                throw new \RuntimeException('XMLRPC 取值不合法');
            }

            $settings['allowXmlRpc'] = $value;
        }

        if (array_key_exists('lang', $values)) {
            $value = self::pick($values, 'lang', '');

            if (!isset(GeneralOptions::getLangs()[$value])) {
                throw new \RuntimeException('不支持的语言');
            }

            $settings['lang'] = $value;
        }

        if (array_key_exists('timezone', $values)) {
            $value = self::pick($values, 'timezone', '');

            if (!isset(self::timezoneOptions()[$value])) {
                throw new \RuntimeException('不支持的时区');
            }

            $settings['timezone'] = $value;
        }

        if (array_key_exists('attachmentTypes', $values) || array_key_exists('attachmentTypesOther', $values)) {
            $builtin = ['@image@', '@media@', '@doc@'];
            $selected = $values['attachmentTypes'] ?? [];
            $selected = is_array($selected)
                ? array_values(array_intersect($builtin, array_map('strval', $selected)))
                : [];
            $other = array_filter(array_map('trim', explode(',', self::pick($values, 'attachmentTypesOther', ''))));
            $other = array_values(array_filter($other, static function (string $ext): bool {
                return preg_match('/^(php|php4|php5|sh|asp|jsp|rb|py|pl|dll|exe|bat)$/i', $ext) === 0;
            }));

            $settings['attachmentTypes'] = implode(',', array_merge($selected, $other));
        }

        foreach ($settings as $name => $value) {
            self::saveOption($name, $value);
        }
    }

    private static function saveReading(array $values): void
    {
        $settings = [];

        if (array_key_exists('postDateFormat', $values)) {
            $settings['postDateFormat'] = self::pick($values, 'postDateFormat', 'Y-m-d');
        }

        $frontPage = self::pick($values, 'frontPage', 'recent');

        if (strpos($frontPage, 'page:') === 0) {
            $cid = (int) substr($frontPage, 5);
            $db = Db::get();
            $row = $db->fetchRow(
                $db->select('cid')->from('table.contents')
                    ->where('cid = ?', $cid)
                    ->where('type = ?', 'page')
                    ->where('status = ?', 'publish')
                    ->where('created < ?', time())
            );

            if ($cid <= 0 || !$row) {
                throw new \RuntimeException('选择的首页页面不存在');
            }

            $frontPage = 'page:' . $cid;
        } elseif (strpos($frontPage, 'file:') === 0) {
            $file = basename(substr($frontPage, 5));
            $theme = (string) Options::alloc()->theme;

            if ($file === '' || $file === 'index.php' || !is_file(Options::alloc()->themeFile($theme, $file))) {
                throw new \RuntimeException('选择的首页模板不存在');
            }

            $frontPage = 'file:' . $file;
        } else {
            $frontPage = 'recent';
        }

        $settings['frontPage'] = $frontPage;

        $archive = $frontPage === 'recent' ? '0' : (self::pick($values, 'frontArchive', '0') === '1' ? '1' : '0');
        $settings['frontArchive'] = $archive;

        $table = self::routingTable();

        if ($archive === '1') {
            $pattern = trim(self::pick($values, 'archivePattern', ''));

            if ($pattern === '') {
                throw new \RuntimeException('启用归档路径时，归档路径不能为空');
            }

            $table['archive'] = ['url' => '/' . ltrim(self::encodeRule($pattern), '/')];
            $table['archive_page'] = ['url' => rtrim($table['archive']['url'], '/') . '/page/[page:digital]/'];
        }

        foreach (['postsListSize' => 10, 'pageSize' => 10] as $key => $default) {
            if (!array_key_exists($key, $values)) {
                continue;
            }

            $number = (int) self::pick($values, $key, (string) $default);

            if ($number < 1) {
                throw new \RuntimeException('文章数量必须是大于 0 的整数');
            }

            $settings[$key] = (string) $number;
        }

        if (array_key_exists('feedFullText', $values)) {
            $feed = self::pick($values, 'feedFullText', '0');

            if (!in_array($feed, ['0', '1'], true)) {
                throw new \RuntimeException('Feed 输出取值不合法');
            }

            $settings['feedFullText'] = $feed;
        }

        foreach ($settings as $name => $value) {
            self::saveOption($name, $value);
        }

        if ($archive === '1') {
            self::saveRoutingTable($table);
        }
    }

    private static function saveDiscussion(array $values): void
    {
        $settings = [];

        if (array_key_exists('commentDateFormat', $values)) {
            $settings['commentDateFormat'] = self::pick($values, 'commentDateFormat', 'Y-m-d');
        }

        foreach (['commentsListSize' => 0, 'commentsPageSize' => 1] as $key => $min) {
            if (!array_key_exists($key, $values)) {
                continue;
            }

            $number = (int) self::pick($values, $key, '10');

            if ($number < $min) {
                throw new \RuntimeException('评论数量取值不合法');
            }

            $settings[$key] = (string) $number;
        }

        if (array_key_exists('commentsPageDisplay', $values)) {
            $value = self::pick($values, 'commentsPageDisplay', 'first');

            if (!in_array($value, ['first', 'last'], true)) {
                throw new \RuntimeException('评论默认显示取值不合法');
            }

            $settings['commentsPageDisplay'] = $value;
        }

        if (array_key_exists('commentsOrder', $values)) {
            $value = self::pick($values, 'commentsOrder', 'DESC');

            if (!in_array($value, ['DESC', 'ASC'], true)) {
                throw new \RuntimeException('评论排序取值不合法');
            }

            $settings['commentsOrder'] = $value;
        }

        if (array_key_exists('commentsMaxNestingLevels', $values)) {
            $value = (int) self::pick($values, 'commentsMaxNestingLevels', '5');
            $settings['commentsMaxNestingLevels'] = (string) min(7, max(2, $value));
        }

        if (array_key_exists('commentsAvatarRating', $values)) {
            $value = self::pick($values, 'commentsAvatarRating', 'G');

            if (!in_array($value, ['G', 'PG', 'R', 'X'], true)) {
                throw new \RuntimeException('头像评级取值不合法');
            }

            $settings['commentsAvatarRating'] = $value;
        }

        $showOptions = [
            'commentsShowCommentOnly',
            'commentsMarkdown',
            'commentsShowUrl',
            'commentsUrlNofollow',
            'commentsAvatar',
            'commentsPageBreak',
            'commentsThreaded',
        ];
        $postOptions = [
            'commentsRequireModeration',
            'commentsWhitelist',
            'commentsRequireMail',
            'commentsRequireUrl',
            'commentsCheckReferer',
            'commentsAntiSpam',
            'commentsAutoClose',
            'commentsPostIntervalEnable',
        ];

        if (array_key_exists('commentsShow', $values)) {
            $selected = $values['commentsShow'];
            $selected = is_array($selected) ? array_map('strval', $selected) : [];

            foreach ($showOptions as $key) {
                $settings[$key] = in_array($key, $selected, true) ? '1' : '0';
            }
        }

        if (array_key_exists('commentsPost', $values)) {
            $selected = $values['commentsPost'];
            $selected = is_array($selected) ? array_map('strval', $selected) : [];

            foreach ($postOptions as $key) {
                $settings[$key] = in_array($key, $selected, true) ? '1' : '0';
            }
        }

        if (array_key_exists('commentsPostTimeout', $values)) {
            $days = (int) self::pick($values, 'commentsPostTimeout', '0');
            $settings['commentsPostTimeout'] = (string) max(0, $days * 86400);
        }

        if (array_key_exists('commentsPostInterval', $values)) {
            $minutes = (float) self::pick($values, 'commentsPostInterval', '0');
            $settings['commentsPostInterval'] = (string) max(0, (int) round($minutes * 60));
        }

        if (array_key_exists('commentsHTMLTagAllowed', $values)) {
            $settings['commentsHTMLTagAllowed'] = self::pick($values, 'commentsHTMLTagAllowed', '');
        }

        foreach ($settings as $name => $value) {
            self::saveOption($name, $value);
        }
    }

    private static function savePermalink(array $values): void
    {
        $settings = [];
        $table = self::routingTable();

        if (!defined('__TYPECHO_REWRITE__') && array_key_exists('rewrite', $values)) {
            $rewrite = self::pick($values, 'rewrite', '0');

            if (!in_array($rewrite, ['0', '1'], true)) {
                throw new \RuntimeException('地址重写取值不合法');
            }

            $settings['rewrite'] = $rewrite;
        }

        $postPattern = self::pick($values, 'postPattern', '');

        if ($postPattern === 'custom') {
            $custom = trim(self::pick($values, 'customPattern', ''));

            if ($custom === '') {
                throw new \RuntimeException('自定义文章路径不能为空');
            }

            $postPattern = '/' . ltrim(self::encodeRule($custom), '/');
        }

        if ($postPattern === '') {
            throw new \RuntimeException('文章路径不能为空');
        }

        $pagePattern = trim(self::pick($values, 'pagePattern', ''));

        if (preg_match('/\{(slug|cid|directory)\}/', $pagePattern) !== 1) {
            throw new \RuntimeException('独立页面路径必须包含 {slug}、{cid} 或 {directory}');
        }

        $categoryPattern = trim(self::pick($values, 'categoryPattern', ''));

        if (preg_match('/\{(slug|mid|directory)\}/', $categoryPattern) !== 1) {
            throw new \RuntimeException('分类路径必须包含 {slug}、{mid} 或 {directory}');
        }

        $table['post'] = ['url' => $postPattern];
        $table['page'] = ['url' => '/' . ltrim(self::encodeRule($pagePattern), '/')];
        $table['category'] = ['url' => '/' . ltrim(self::encodeRule($categoryPattern), '/')];
        $table['category_page'] = ['url' => rtrim($table['category']['url'], '/') . '/page/[page:digital]/'];

        foreach ($settings as $name => $value) {
            self::saveOption($name, $value);
        }

        self::saveRoutingTable($table);
    }

    /**
     * 取表单值：只接受标量，数组返回默认值
     *
     * @param mixed $default
     */
    private static function pick(array $values, string $key, $default = '')
    {
        if (!array_key_exists($key, $values)) {
            return $default;
        }

        $value = $values[$key];

        return is_array($value) ? $default : trim((string) $value);
    }

    /**
     * 读取路由表
     */
    private static function routingTable(): array
    {
        $raw = self::optionValue('routingTable');
        $table = $raw === null ? [] : json_decode($raw, true);

        return is_array($table) ? $table : [];
    }

    /**
     * 写回路由表，并移除解析后的数字索引
     */
    private static function saveRoutingTable(array $table): void
    {
        unset($table[0]);

        self::saveOption('routingTable', json_encode($table, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    /**
     * 时区表，与后台基础设置保持一致
     *
     * @return array<string,string>
     */
    private static function timezoneOptions(): array
    {
        return [
            '-43200' => 'UTC-12:00 国际日期变更线西',
            '-39600' => 'UTC-11:00 协调世界时-11',
            '-36000' => 'UTC-10:00 夏威夷时间',
            '-32400' => 'UTC-09:00 阿拉斯加时间',
            '-28800' => 'UTC-08:00 太平洋时间',
            '-25200' => 'UTC-07:00 山地时间',
            '-21600' => 'UTC-06:00 中部时间',
            '-18000' => 'UTC-05:00 东部时间',
            '-14400' => 'UTC-04:00 大西洋时间',
            '-10800' => 'UTC-03:00 巴西时间',
            '-7200' => 'UTC-02:00 协调世界时-02',
            '-3600' => 'UTC-01:00 亚速尔群岛时间',
            '0' => 'UTC 协调世界时',
            '3600' => 'UTC+01:00 中欧时间',
            '7200' => 'UTC+02:00 东欧时间',
            '10800' => 'UTC+03:00 莫斯科时间',
            '12600' => 'UTC+03:30 伊朗时间',
            '14400' => 'UTC+04:00 迪拜时间',
            '16200' => 'UTC+04:30 阿富汗时间',
            '18000' => 'UTC+05:00 巴基斯坦时间',
            '19800' => 'UTC+05:30 印度时间',
            '20700' => 'UTC+05:45 尼泊尔时间',
            '21600' => 'UTC+06:00 孟加拉时间',
            '23400' => 'UTC+06:30 缅甸时间',
            '25200' => 'UTC+07:00 泰国时间',
            '28800' => 'UTC+08:00 北京时间',
            '32400' => 'UTC+09:00 东京时间',
            '34200' => 'UTC+09:30 澳大利亚中部时间',
            '36000' => 'UTC+10:00 悉尼时间',
            '39600' => 'UTC+11:00 所罗门群岛时间',
            '43200' => 'UTC+12:00 新西兰时间',
        ];
    }

    /**
     * 路径模板编码，与 Permalink::encodeRule() 一致
     */
    private static function encodeRule(string $rule): string
    {
        return str_replace(
            ['{cid}', '{slug}', '{category}', '{directory}', '{year}', '{month}', '{day}', '{mid}'],
            [
                '[cid:digital]',
                '[slug]',
                '[category]',
                '[directory:split:0]',
                '[year:digital:4]',
                '[month:digital:2]',
                '[day:digital:2]',
                '[mid:digital]',
            ],
            $rule
        );
    }

    /**
     * 路径模板解码，与 Permalink::decodeRule() 一致
     */
    private static function decodeRule(string $rule): string
    {
        return preg_replace('/\[([_a-z0-9-]+)[^\]]*\]/i', '{$1}', $rule) ?? $rule;
    }

    // ─── 站点设置读写辅助 ──────────────────────────────────────────────────

    /**
     * 读取单个站点选项
     *
     * 直接用 SQL 读，绕开 Options 的进程内缓存，保证保存后立刻能读到新值。
     */
    private static function optionValue(string $name): ?string
    {
        $db = Db::get();
        $row = $db->fetchRow($db->select('value')->from('table.options')->where('name = ?', $name)->limit(1));

        if (!$row) {
            return null;
        }

        return (string) $row['value'];
    }

    /**
     * 写入单个站点选项，不存在则插入
     */
    private static function saveOption(string $name, string $value): void
    {
        $db = Db::get();
        $row = $db->fetchRow($db->select('name')->from('table.options')->where('name = ?', $name)->limit(1));

        if ($row) {
            $db->query($db->update('table.options')->rows(['value' => $value])->where('name = ?', $name));
        } else {
            $db->query($db->insert('table.options')->rows([
                'name' => $name,
                'user' => 0,
                'value' => $value,
            ]));
        }
    }

    // ─── 主题设置辅助 ──────────────────────────────────────────────────────

    /**
     * 构建当前主题的配置表单
     *
     * 不走 Widget\Themes\Config，避免其 execute() 的管理员校验与页面输出。
     */
    private static function buildThemeForm(string $theme): Form
    {
        $file = Options::alloc()->themeFile($theme, 'functions.php');

        if (!is_file($file)) {
            throw new \RuntimeException('当前主题没有配置功能');
        }

        require_once $file;

        if (!function_exists('themeConfig')) {
            throw new \RuntimeException('当前主题没有配置功能');
        }

        $form = new Form();

        ob_start();

        try {
            themeConfig($form);
        } finally {
            ob_end_clean();
        }

        return $form;
    }

    /**
     * 读取主题已保存配置
     */
    private static function themeValues(string $theme): array
    {
        $raw = self::optionValue('theme:' . $theme);

        if ($raw === null || $raw === '') {
            return [];
        }

        $values = json_decode($raw, true);

        return is_array($values) ? $values : [];
    }


    private static function countContents(Db $db, string $type, ?string $status = null): int
    {
        $query = $db->select(['COUNT(table.contents.cid)' => 'num'])
            ->from('table.contents')
            ->where('type = ?', $type);

        if ($status !== null) {
            $query->where('status = ?', $status);
        }

        $row = $db->fetchObject($query);

        return (int) ($row->num ?? 0);
    }

    private static function countComments(Db $db, ?string $status = null): int
    {
        $query = $db->select(['COUNT(table.comments.coid)' => 'num'])->from('table.comments');

        if ($status !== null) {
            $query->where('status = ?', $status);
        }

        $row = $db->fetchObject($query);

        return (int) ($row->num ?? 0);
    }

    private static function countMetas(Db $db, string $type): int
    {
        $row = $db->fetchObject(
            $db->select(['COUNT(table.metas.mid)' => 'num'])->from('table.metas')
                ->where('type = ?', $type)
        );

        return (int) ($row->num ?? 0);
    }

    /**
     * 校验插件并取回入口文件、类名与头信息
     *
     * @return array{0:string,1:string,2:array}
     */
    private static function resolve(string $name): array
    {
        if ($name === '' || preg_match('/^[A-Za-z0-9_\-]+$/', $name) !== 1) {
            throw new \RuntimeException('插件名不合法');
        }

        try {
            [$file, $class] = Plugin::portal($name, self::pluginDir());
        } catch (\Throwable $e) {
            throw new \RuntimeException('插件不存在');
        }

        $activated = Plugin::export()['activated'] ?? [];

        if (!isset($activated[$name])) {
            throw new \RuntimeException('插件未启用，暂不支持配置');
        }

        $info = Plugin::parseInfo($file);

        if (empty($info['config'])) {
            throw new \RuntimeException('该插件没有配置表单');
        }

        return [$file, $class, $info];
    }

    /**
     * 读取已保存的配置
     *
     * 直接用 SQL 读，绕开 Options 的进程内缓存，保证保存后立刻能读到新值。
     */
    private static function savedValues(string $name): array
    {
        $db = Db::get();
        $row = $db->fetchRow(
            $db->select('value')->from('table.options')->where('name = ?', 'plugin:' . $name)->limit(1)
        );

        if (!$row) {
            return [];
        }

        $value = json_decode((string) $row['value'], true);

        return is_array($value) ? $value : [];
    }

    /**
     * 构建插件配置表单并回填值
     *
     * @param string $class 插件类名
     * @param array $values 已保存的配置
     * @throws \RuntimeException
     */
    private static function buildForm(string $class, array $values): Form
    {
        if (!class_exists($class) || !method_exists($class, 'config')) {
            throw new \RuntimeException('插件配置不可用');
        }

        $form = new Form();

        // 个别插件的 config() 会直接 echo，收集后丢弃，避免污染 JSON 响应
        ob_start();

        try {
            call_user_func([$class, 'config'], $form);
        } finally {
            ob_end_clean();
        }

        foreach ($form->getInputs() as $key => $input) {
            if (array_key_exists($key, $values)) {
                $input->value($values[$key]);
            }
        }

        return $form;
    }

    /**
     * 表单元素序列化为 App 可渲染的结构
     *
     * @return array
     */
    private static function serialize(Form $form): array
    {
        $fields = [];

        foreach ($form->getInputs() as $name => $input) {
            $type = self::typeOf($input);

            if ($type === null) {
                continue;
            }

            $field = [
                'name' => (string) $name,
                'label' => self::labelOf($input),
                'description' => self::descriptionOf($input),
                'type' => $type,
                'value' => self::valueOf($input, $type),
            ];

            $options = self::optionsOf($input);

            if ($options !== null) {
                $field['options'] = $options;
            }

            $fields[] = $field;
        }

        return $fields;
    }

    private static function typeOf(Element $input): ?string
    {
        // 提交按钮与伪元素不参与配置读写
        if ($input instanceof Submit || $input instanceof Fake) {
            return null;
        }

        if ($input instanceof Textarea) {
            return 'textarea';
        }

        if ($input instanceof Select) {
            return 'select';
        }

        if ($input instanceof Radio) {
            return 'radio';
        }

        if ($input instanceof Checkbox) {
            return 'checkbox';
        }

        if ($input instanceof Hidden) {
            return 'hidden';
        }

        if ($input instanceof Password) {
            return 'password';
        }

        if ($input instanceof Number) {
            return 'number';
        }

        $htmlType = isset($input->input) ? $input->input->getAttribute('type') : null;

        if ($htmlType === 'number' || $htmlType === 'password' || $htmlType === 'hidden') {
            return $htmlType;
        }

        return 'text';
    }

    /**
     * @return mixed
     */
    private static function valueOf(Element $input, string $type)
    {
        $value = $input->value;

        if ($type === 'checkbox') {
            if (is_array($value)) {
                return array_values(array_map('strval', $value));
            }

            return $value === null || $value === '' ? [] : [(string) $value];
        }

        return is_array($value) ? '' : ($value === null ? '' : (string) $value);
    }

    private static function labelOf(Element $input): string
    {
        return isset($input->label) ? self::textOf($input->label) : '';
    }

    private static function descriptionOf(Element $input): string
    {
        if (!isset($input->container)) {
            return '';
        }

        foreach ($input->container->getItems() as $item) {
            if ($item->getAttribute('class') === 'description') {
                return self::textOf($item);
            }
        }

        return '';
    }

    /**
     * Select / Radio / Checkbox 的选项
     *
     * @return array|null 非选项元素返回 null
     */
    private static function optionsOf(Element $input): ?array
    {
        $options = [];

        if ($input instanceof Select) {
            $select = $input->inputs[0] ?? null;

            if (!$select) {
                return [];
            }

            foreach ($select->getItems() as $option) {
                $options[] = [
                    'value' => (string) $option->getAttribute('value'),
                    'label' => self::textOf($option),
                    'checked' => $option->getAttribute('selected') !== null,
                ];
            }

            return $options;
        }

        if (!($input instanceof Radio) && !($input instanceof Checkbox)) {
            return null;
        }

        if (!isset($input->container)) {
            return [];
        }

        foreach ($input->container->getItems() as $row) {
            $node = null;
            $label = null;

            foreach ($row->getItems() as $child) {
                if ($child->getTagName() === 'input') {
                    $node = $child;
                } elseif ($child->getTagName() === 'label') {
                    $label = $child;
                }
            }

            if (!$node) {
                continue;
            }

            $options[] = [
                'value' => (string) $node->getAttribute('value'),
                'label' => $label ? self::textOf($label) : (string) $node->getAttribute('value'),
                'checked' => $node->getAttribute('checked') !== null,
            ];
        }

        return $options;
    }

    /**
     * 渲染 Layout 并取出纯文本
     *
     * Layout 的 html 是私有属性且没有 getter，只能渲染后截取。
     */
    private static function textOf(Layout $node): string
    {
        ob_start();
        $node->html();
        $html = (string) ob_get_clean();

        return trim(strip_tags($html));
    }
}
