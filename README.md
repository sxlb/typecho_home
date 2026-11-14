# 凉薄写作 · Typecho 安卓客户端

用手机随时写 Markdown、发布到 Typecho 博客，并在 App 内完成日常站点管理的安卓客户端。

前端使用 Vite + Vditor，容器为 Capacitor 7（Android WebView）；服务端由同仓库的 Typecho 插件 `SxlbPublisher` 提供带 HMAC 签名的接口。

## 功能介绍

### 写作与发布

- Markdown 编辑器（Vditor IR 模式），本地静态资源，不依赖外网 CDN
- 相册选图 / 拍照上传，自动插入图片链接
- 草稿与发布双通道，支持定时发布（未来时间自动上线）
- 分类、标签、缩略图、摘要、原创/转载等 13 个 Handsome 字段
- 发布结果与网页后台完全一致：经过 `Widget\Contents\Post\Edit`，正常触发 SEO、AI 摘要、搜索索引等插件钩子
- 编辑自动存本地草稿，断网不丢内容

### 站点管理

- **概览**：文章、草稿、评论、待审核、媒体、分类、标签计数
- **文章**：列表、编辑、删除
- **评论**：按状态筛选（全部 / 待审核 / 已通过 / 垃圾），通过、转待审核、标垃圾、站长回复、删除
- **媒体库**：附件列表、图片缩略图、直接上传、复制链接、删除
- **分类与标签**：新建、编辑（名称、slug、描述、排序、父分类）、删除；删除分类时子分类自动上移
- **插件**：启用 / 停用 / 配置；停用保留配置，重新启用无需重填
- **站点设置**：基本、阅读、评论、永久链接四组原生设置
- **主题设置**：读取当前主题的 `themeConfig` 表单并保存

## 快速开始

### 1. 安装 Typecho 插件

1. 下载 [`sxlb-publisher.zip`](https://github.com/sxlb/typecho_home/releases/download/plugin-latest/sxlb-publisher.zip)
2. 解压后把 `SxlbPublisher` 目录上传到站点 `usr/plugins/` 下
3. 进入博客后台「控制台 → 插件」，启用 `SxlbPublisher`
4. 打开插件设置，填写：
   - `API Token`：客户端识别串（32 位随机串）
   - `API Secret`：HMAC 签名密钥（64 位随机串）
   - `作者 ID`：发布文章归属的用户 ID
   - `管理接口`：需要使用评论 / 媒体 / 站点管理时设为「开启」
5. 保存设置

插件会注册 `/writer-api/*` 路由，所有写操作需要 `Token + 时间戳 + HMAC-SHA256` 签名，时间偏差超过 300 秒拒绝。

### 2. 安装 App

下载并安装 [`sxlb-writer.apk`](https://github.com/sxlb/typecho_home/releases/latest/download/sxlb-writer.apk)，首次安装需允许「安装未知来源应用」。最低支持 Android 8.0（API 26）。

### 3. 配置 App

打开 App 进入设置页，填写：

| 配置项 | 说明 | 示例 |
|---|---|---|
| 服务器地址 | 博客完整地址，不带结尾斜杠 | `https://blog.sxlb.xyz` |
| API Token | 与插件设置一致 | `7dd6b2fb...` |
| API Secret | 与插件设置一致 | `9f3a...` |
| 管理模式 | 显示站点管理入口 | 开启 |
| 默认分类 | 发布时未选分类的兜底分类 | 可选 |

配置完成后回到首页下拉刷新，即可看到文章列表。

## 固定下载地址

- App：`https://github.com/sxlb/typecho_home/releases/latest/download/sxlb-writer.apk`
- 插件：`https://github.com/sxlb/typecho_home/releases/download/plugin-latest/sxlb-publisher.zip`

App 与插件分开发布：`latest` 始终指向最新 App，`plugin-latest` 固定指向最新插件，两者版本互不影响。

## 本地开发

```bash
npm install        # 安装依赖，并复制 Vditor 静态资源到 public/vditor
npm run dev        # 浏览器调试（默认 http://localhost:5173）
npm run build      # 构建前端到 dist/
```

打包安卓工程需要 Android SDK 与 JDK 21：

```bash
npx cap add android      # 首次生成原生工程
npm run sync             # 构建并同步资源
cd android && ./gradlew assembleDebug
```

日常构建与发版由 GitHub Actions 完成：推送到 `main` 后自动产出 APK 与插件 zip，并分别发布到两个 Release。

## 目录结构

```
.
├── index.html                     # 列表 / 编辑 / 管理三个视图
├── src/
│   ├── main.js                    # 视图切换、文章列表、发布、设置
│   ├── api.js                     # HMAC 签名、请求封装、图片压缩与上传
│   ├── editor.js                  # Vditor 初始化、选图上传
│   ├── admin.js                   # 管理页：概览、评论、媒体、分类标签、插件、站点
│   └── ui.css                     # 移动端布局与主题
├── plugins/SxlbPublisher/         # Typecho 插件源码
│   ├── Plugin.php                 # 激活、路由注册、配置表单
│   ├── Action.php                 # 接口分发与鉴权
│   ├── PostEdit.php               # 跳过权限校验、手动触发钩子的 Edit 子类
│   └── Api/                       # Post / Upload / Meta / Admin / Comment / Media
├── scripts/                       # 构建辅助脚本
└── .github/workflows/android.yml  # 云端构建与双 Release 发布
```

## 版本历史

- **v2.2.0**：分类与标签管理、媒体库直接上传、概览增加分类/标签计数
- **v2.1.0**：评论管理（筛选 / 审核 / 回复 / 删除）、媒体库（列表 / 复制链接 / 删除）
- **v2.0.0**：插件启用停用、站点四组设置、当前主题设置；插件源码入库与双 Release 发布
- **v1.x**：Markdown 写作、图片上传、草稿与定时发布、分类标签

## 安全说明

- 接口签名：`HMAC_SHA256(secret, 时间戳 + "\n" + 路径 + "\n" + 原始请求体)`
- 时间戳有效期 300 秒，签名使用常量时间比较
- Token / Secret 只从请求头读取，不接受 URL 参数
- 管理接口默认关闭，需在插件设置中显式开启
- App 内配置保存在本地 WebView 存储，请勿在公共设备上保存密钥

## 许可证

仅用于个人博客写作与站点管理，按需自建、自行承担部署风险。
