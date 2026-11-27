import './ui.css';
import { call, callAdmin, uploadImage, getSettings, saveSettings, isConfigured, DEFAULT_SETTINGS } from './api.js';
import {
  initEditor,
  getEditorValue,
  setEditorValue,
  applyEditorTheme,
  destroyEditor,
  closeEditorSheets,
} from './editor.js';
import { initAdmin, openAdmin, openAdminTool, handleAdminBack, refreshMeStats, setAdminEnabled } from './admin.js';
import { initDetail, openPostDetail, openShuoshuoDetail, resetDetail } from './detail.js';
import {
  newDraftId,
  readDraft,
  writeDraft,
  removeDraft,
  listDrafts,
  pushHistory,
  readHistory,
  clearHistory,
  migrateLegacyDraft,
  listQueue,
  upsertQueue,
  failQueue,
  removeQueue,
  removeQueueByDraftKey,
  clearQueue,
} from './local.js';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import {
  downloadApk,
  dropLegacyApk,
  fetchLatestRelease,
  findSavedApk,
  openApk,
  saveApk,
} from './update.js';

const $ = (selector) => document.querySelector(selector);

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
const DOWNLOAD_URL = 'https://github.com/sxlb/typecho_home/releases/latest/download/sxlb-writer.apk';

// 列表项右侧的小图标：评论 / 预览
const COMMENT_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.6a8.4 8.4 0 0 1-9.3 8.4 9.2 9.2 0 0 1-3.2-.7L3 21l1.7-4.9A8.4 8.4 0 1 1 21 11.6z"/></svg>';
const PREVIEW_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12S18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/></svg>';

const el = {
  views: {
    list: $('#view-list'),
    admin: $('#view-admin'),
    shuoshuo: $('#view-shuoshuo'),
    album: $('#view-album'),
    calendar: $('#view-calendar'),
    me: $('#view-me'),
    detail: $('#view-detail'),
    pages: $('#view-pages'),
    links: $('#view-links'),
    stats: $('#view-stats'),
    visitors: $('#view-visitors'),
    editor: $('#view-editor'),
    settings: $('#view-settings'),
  },
  tabbar: $('#tabbar'),
  meServer: $('#me-server'),
  meVersion: $('#me-version'),
  meTools: $('#me-tools'),
  meStats: $('#me-stats'),
  meDashboard: $('#me-dashboard'),
  meCheckUpdate: $('#me-check-update'),
  tabBadge: $('#tab-badge-me'),
  listLoading: $('#list-loading'),
  listSkeleton: $('#list-skeleton'),
  queueBar: $('#queue-bar'),
  queueText: $('#queue-text'),
  queueRetry: $('#queue-retry'),
  queueClear: $('#queue-clear'),
  listEmpty: $('#list-empty'),
  emptyTitle: $('#list-empty-title'),
  emptyDesc: $('#list-empty-desc'),
  clearFilters: $('#list-clear-filters'),
  listItems: $('#list-items'),
  listMore: $('#list-more'),
  listTitle: $('#list-title'),
  listCount: $('#list-count'),
  listSearch: $('#list-search'),
  listFilters: $('#list-filters'),
  listCategory: $('#list-category'),
  selectBtn: $('#btn-select'),
  batchBar: $('#batch-bar'),
  batchAll: $('#batch-all'),
  batchCount: $('#batch-count'),
  batchDraft: $('#batch-draft'),
  batchPublish: $('#batch-publish'),
  title: $('#post-title'),
  editorStatus: $('#editor-status'),
  sheet: $('#sheet'),
  sheetMask: $('#sheet-mask'),
  categoryChips: $('#category-chips'),
  tagChips: $('#tag-chips'),
  tags: $('#publish-tags'),
  summary: $('#publish-summary'),
  albumField: $('#publish-album-field'),
  albumText: $('#publish-album'),
  thumb: $('#publish-thumb'),
  reprint: $('#publish-reprint'),
  pinned: $('#publish-pinned'),
  created: $('#publish-created'),
  slug: $('#publish-slug'),
  historySheet: $('#history-sheet'),
  historyMask: $('#history-mask'),
  historyList: $('#history-list'),
  itemSheet: $('#item-sheet'),
  itemMask: $('#item-mask'),
  itemTitle: $('#item-sheet-title'),
  itemActions: $('#item-actions'),
  shuoshuoLoading: $('#shuoshuo-loading'),
  shuoshuoEmpty: $('#shuoshuo-empty'),
  shuoshuoItems: $('#shuoshuo-items'),
  shuoshuoMore: $('#shuoshuo-more'),
  shuoshuoSheet: $('#shuoshuo-sheet'),
  shuoshuoSheetTitle: $('#shuoshuo-sheet-title'),
  shuoshuoMask: $('#shuoshuo-sheet-mask'),
  shuoshuoText: $('#shuoshuo-text'),
  shuoshuoSecret: $('#shuoshuo-secret'),
  shuoshuoUploads: $('#shuoshuo-uploads'),
  albumLoading: $('#album-loading'),
  albumSummary: $('#album-summary'),
  albumEmpty: $('#album-empty'),
  albumGrid: $('#album-grid'),
  albumMore: $('#album-more'),
  albumSheet: $('#album-sheet'),
  albumSheetMask: $('#album-sheet-mask'),
  albumTitle: $('#album-title'),
  albumDesc: $('#album-desc'),
  albumPicker: $('#album-picker'),
  albumViewer: $('#album-viewer'),
  albumViewerTrack: $('#album-viewer-track'),
  albumViewerCount: $('#album-viewer-count'),
  albumViewerCaption: $('#album-viewer-caption'),
  calendarTitle: $('#calendar-title'),
  calendarGrid: $('#calendar-grid'),
  calendarDayTitle: $('#calendar-day-title'),
  calendarItems: $('#calendar-items'),
  calendarLoading: $('#calendar-loading'),
  pagesLoading: $('#pages-loading'),
  pagesEmpty: $('#pages-empty'),
  pagesItems: $('#pages-items'),
  pagesMore: $('#pages-more'),
  pageSheet: $('#page-sheet'),
  pageMask: $('#page-sheet-mask'),
  pageTemplate: $('#page-template'),
  pageStatus: $('#page-status'),
  pageOrder: $('#page-order'),
  pageSlug: $('#page-slug'),
  pageAllowComment: $('#page-allow-comment'),
  linksLoading: $('#links-loading'),
  linksEmpty: $('#links-empty'),
  linksItems: $('#links-items'),
  linkSheet: $('#link-sheet'),
  linkMask: $('#link-sheet-mask'),
  linkSheetTitle: $('#link-sheet-title'),
  linkName: $('#link-name'),
  linkUrl: $('#link-url'),
  linkSort: $('#link-sort'),
  linkImage: $('#link-image'),
  linkDescription: $('#link-description'),
  linkOrder: $('#link-order'),
  linkDelete: $('#link-delete'),
  statsLoading: $('#stats-loading'),
  statsContent: $('#stats-content'),
  statsGrid: $('#stats-grid'),
  statsRange: $('#stats-range'),
  statsTrendTitle: $('#stats-trend-title'),
  statsChart: $('#stats-chart'),
  statsCategories: $('#stats-categories'),
  statsVisitMetrics: $('#stats-visit-metrics'),
  statsVisitChart: $('#stats-visit-chart'),
  statsVisitLegend: $('#stats-visit-legend'),
  statsVisitPages: $('#stats-visit-pages'),
  visitorsRange: $('#visitors-range'),
  visitorsSummary: $('#visitors-summary'),
  visitorsLoading: $('#visitors-loading'),
  visitorsEmpty: $('#visitors-empty'),
  visitorsItems: $('#visitors-items'),
  visitorsMore: $('#visitors-more'),
  preview: $('#btn-preview'),
  dialog: $('#dialog'),
  appVersion: $('#app-version'),
  update: {
    panel: $('#update-panel'),
    title: $('#update-title'),
    badge: $('#update-badge'),
    desc: $('#update-desc'),
    bar: $('#update-progress'),
    install: $('#btn-update-install'),
    browser: $('#btn-update-browser'),
  },
  toast: $('#toast'),
  check: {
    panel: $('#publish-check'),
    toggle: $('#check-toggle'),
    title: $('#check-title'),
    count: $('#check-count'),
    list: $('#check-list'),
  },
  settings: {
    server: $('#set-server'),
    token: $('#set-token'),
    secret: $('#set-secret'),
    heroDot: $('#settings-hero-dot'),
    heroTitle: $('#settings-hero-title'),
    heroSub: $('#settings-hero-sub'),
    heroVersion: $('#settings-hero-version'),
    mode: $('#set-editor-mode'),
    size: $('#set-editor-size'),
    postOpen: $('#set-post-open'),
    theme: $('#set-theme'),
    style: $('#set-style'),
    custom: $('#custom-theme'),
    accent: $('#set-accent'),
    bg: $('#set-bg'),
    surface: $('#set-surface'),
    radius: $('#set-radius'),
    radiusValue: $('#set-radius-value'),
    adminMode: $('#set-admin-mode'),
    meLayout: $('#set-me-layout'),
  },
};

const state = {
  view: 'list',
  cid: 0,
  draftKey: '',
  // 编辑器当前编辑的对象类型：post 文章 / page 独立页面
  kind: 'post',
  // 当前对象的线上地址，用于编辑器顶栏预览
  currentUrl: '',
  // 页面模式下的模板 / 状态 / 排序 / 链接等设置
  pageMeta: null,
  // 页面列表的来源视图，返回时回到管理页或首页
  pagesFrom: 'list',
  // 从相册 / 日历进入的文章编辑器，返回时回到来源视图（'' 表示首页列表）
  returnView: '',
  // 预览页的来源视图，返回时回到这里
  detailFrom: 'list',
  // 设置页的来源：me 表示从「我的」进入
  settingsFrom: 'list',
  // 当前编辑的文章是否属于相册分类（决定「相册描述」字段是否显示）
  imagePost: false,
  status: 'draft',
  dirty: false,
  metasLoaded: false,
  categories: [],
  tags: [],
  selectedMids: new Set(),
  selectedTagNames: new Set(),
  autosaveTimer: null,
  searchTimer: null,
  toastTimer: null,
  posts: [],
  // 当前筛选下的服务端文章总数，用于列表顶部计数
  total: 0,
  filter: 'all',
  // 分类筛选：0 表示全部分类，其余为 mid
  category: 0,
  query: '',
  page: 1,
  hasMore: false,
  listLoading: false,
  update: null,
  item: null,
  allowWarnings: false,
  checkDraft: true,
  quotaWarned: false,
  // 批量选择模式：只对已同步到服务端的文章 / 草稿生效
  selecting: false,
  selectedCids: new Set(),
};

// 打开详情（文章 / 页面）的请求序号：弱网连点两篇时只认最后一次，旧响应直接丢弃
let openDetailSeq = 0;

// ─── 通用 ────────────────────────────────────────────────────────────────

/** 顶层视图：显示底部导航 */
const TAB_VIEWS = ['list', 'shuoshuo', 'album', 'me'];

function show(view) {
  state.view = view;

  Object.entries(el.views).forEach(([name, node]) => {
    node.hidden = name !== view;
  });

  if (el.tabbar) {
    el.tabbar.hidden = !TAB_VIEWS.includes(view);

    el.tabbar.querySelectorAll('.tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.view === view);
    });
  }

  // 底部导航存在时，浮动按钮 / 提示条需要抬高，避免被遮挡
  document.body.classList.toggle('has-tabbar', TAB_VIEWS.includes(view));
}

/**
 * 底部导航切换
 *
 * 未配置时只允许停留在「写作」与「我的」，其余 Tab 直接引导去设置。
 */
function switchTab(view) {
  if (!view || view === state.view) {
    return;
  }

  if (!isConfigured() && view !== 'list' && view !== 'me') {
    openSettings();
    return;
  }

  if (view === 'shuoshuo') {
    openShuoshuo();
    return;
  }

  if (view === 'album') {
    openAlbum();
    return;
  }

  if (view === 'me') {
    openMe();
    return;
  }

  show('list');

  if (!state.posts.length) {
    loadPosts({ reset: true });
  }
}

/** 「我的」：账号卡、站点概览、管理入口、设置与版本 */
function openMe() {
  const settings = getSettings();

  if (el.meServer) {
    el.meServer.textContent = settings.server || '未配置服务器';
  }

  if (el.meVersion) {
    const latest = state.update?.version;

    // 与当前版本相同时不重复显示「最新 vX」
    el.meVersion.textContent = latest && latest !== APP_VERSION
      ? `v${APP_VERSION} · 最新 v${latest}`
      : `v${APP_VERSION}`;
  }

  applyAdminEntry();
  show('me');

  // 概览统计常驻「我的」页，进页即刷新；未开启管理模式时不发请求
  if (adminReady(settings)) {
    refreshMeStats();
  }
}

function toast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    el.toast.hidden = true;
  }, 2200);
}

const themeQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

/**
 * 解析外观偏好为实际的 light / dark
 *
 * @param {'auto'|'light'|'dark'} pref
 * @returns {'light'|'dark'}
 */
function resolveTheme(pref) {
  if (pref === 'light' || pref === 'dark') {
    return pref;
  }

  return themeQuery?.matches ? 'dark' : 'light';
}

/**
 * 把外观写到 <html data-theme>，CSS 变量与 Vditor 主题都依赖它
 *
 * @param {'auto'|'light'|'dark'} [pref]
 */
function applyTheme(pref = getSettings().theme) {
  const theme = resolveTheme(pref);

  document.documentElement.dataset.theme = theme;

  // 自定义风格下顶栏颜色跟随自定义背景，其余仍用内置深浅色
  const customBg =
    document.documentElement.dataset.style === 'custom' && theme === 'light'
      ? normalizeHex(currentCustomTheme().bg, '#f6f5f2')
      : null;

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', customBg || (theme === 'dark' ? '#161514' : '#f6f5f2'));
  // Vditor 的配色不走 CSS 变量，需要单独同步
  applyEditorTheme(theme);

  // 深浅切换后重新计算自定义主题（背景 / 卡片是否生效取决于模式）
  if (document.documentElement.dataset.style === 'custom') {
    applyCustomTheme(currentCustomTheme());
  }
}

const EDITOR_FONT_SIZES = ['small', 'normal', 'large', 'xlarge'];

/**
 * 写作字号：写到 <html data-editor-size>，CSS 变量统一控制正文与源码区
 *
 * @param {'small'|'normal'|'large'|'xlarge'} [value]
 */
function applyFontSize(value = getSettings().editorFontSize) {
  document.documentElement.dataset.editorSize = EDITOR_FONT_SIZES.includes(value)
    ? value
    : DEFAULT_SETTINGS.editorFontSize;
}

/**
 * 软键盘适配：把应用高度收缩到真正可见的区域
 *
 * Android WebView 在键盘弹出时不一定缩小布局视口，底部工具栏会被输入法盖住。
 * 监听 visualViewport 后写 --app-height：
 *   - 键盘弹出：高度变小，编辑器工具栏随之上移
 *   - 键盘收起：回到窗口高度，不留空白
 */
function bindAppHeight() {
  const viewport = window.visualViewport;

  if (!viewport) {
    return;
  }

  const apply = () => {
    // 双指缩放时可视高度同样会变小，不能误判成键盘
    if (viewport.scale > 1.01) {
      return;
    }

    const visible = Math.round(viewport.height);
    const full = Math.round(window.innerHeight);

    // 差值小于 80px 视为地址栏 / 测量误差，用满高更稳
    document.documentElement.style.setProperty(
      '--app-height',
      `${visible < full - 80 ? visible : full}px`,
    );
  };

  viewport.addEventListener('resize', apply);
  // 键盘弹出时布局视口可能被滚动，scroll 也要同步
  viewport.addEventListener('scroll', apply);
  apply();
}

/**
 * 管理模式是否可用：本地开关 + 已配置服务器
 *
 * @param {object} [settings]
 * @returns {boolean}
 */
function adminReady(settings = getSettings()) {
  const enabled = (settings.adminMode || DEFAULT_SETTINGS.adminMode) === 'on';
  return enabled && Boolean(String(settings.server || '').trim());
}

/**
 * 管理模式入口：「我的」页的管理宫格
 *
 * 服务端还有独立的管理接口开关，这里只控制 App 内入口是否可见。
 */
function applyAdminEntry() {
  const settings = getSettings();
  const enabled = (settings.adminMode || DEFAULT_SETTINGS.adminMode) === 'on';
  const ready = adminReady(settings);
  let reason = '';

  if (!enabled) {
    reason = '先在设置里开启「管理模式」，并确认插件已打开管理接口';
  } else if (!ready) {
    reason = '先在设置里填写博客地址，再查看站点数据';
  }

  setAdminEnabled(ready, reason);

  // 管理能力没了，待审核角标也不该留着
  if (!ready) {
    setTabBadge(0);
  }
}

/**
 * 管理子视图的来源
 *
 * 「我的」页宫格可一步直达数据看板 / 评论 / 页面等，
 * 这些页面返回时应该回「我的」，而不是绕回管理页。
 *
 * @type {'me'|'admin'|''}
 */
let adminFrom = '';

/** 管理子视图返回：宫格进入的回「我的」，管理页进入的回管理页 */
function backFromAdminChild() {
  const from = adminFrom === 'me' ? 'me' : 'admin';

  adminFrom = '';
  show(from);
}

/**
 * 「我的」页概览数字的去向
 *
 * 已发布 / 草稿 回写作列表并套用对应筛选，其余直接进管理工具。
 *
 * @param {'posts'|'drafts'|'comments'|'media'|'categories'|'tags'} key
 */
function openStatTarget(key) {
  if (key === 'posts' || key === 'drafts') {
    openListWithFilter(key === 'posts' ? 'publish' : 'draft');
    return;
  }

  adminFrom = 'me';
  show('admin');

  if (key === 'comments') {
    openAdminTool('comments');
  } else if (key === 'media') {
    openAdminTool('media');
  } else if (key === 'categories') {
    openAdminTool('metas', 'category');
  } else if (key === 'tags') {
    openAdminTool('metas', 'tag');
  }
}

/**
 * 回写作列表并套用筛选
 *
 * @param {'all'|'publish'|'draft'|'scheduled'|'local'} filter
 */
function openListWithFilter(filter) {
  state.filter = filter;
  resetBatchSelection();

  [...el.listFilters.children].forEach((chip) => {
    chip.classList.toggle('active', chip.dataset.filter === filter);
  });

  show('list');
  renderList();

  if (isConfigured()) {
    loadPosts({ reset: true });
  }
}

/**
 * 「我的」页管理入口排布
 *
 * compact：一行 5 列；relaxed：两行（3 + 2）。
 */
function applyMeLayout() {
  const layout = getSettings().meLayout || DEFAULT_SETTINGS.meLayout;

  document.documentElement.dataset.meLayout = layout === 'relaxed' ? 'relaxed' : 'compact';
}

// ─── 界面风格 ────────────────────────────────────────────────────────────

const STYLE_OPTIONS = ['classic', 'paper', 'soft', 'contrast', 'custom'];

// 设置页里尚未保存的自定义配色，用于实时预览
let customPreview = null;
let styleSelection = DEFAULT_SETTINGS.style;

function currentCustomTheme() {
  return customPreview || getSettings().customTheme || DEFAULT_SETTINGS.customTheme;
}

/**
 * 切换界面风格
 *
 * classic / paper / soft / contrast 由 CSS 变量接管；
 * custom 把自定义配色写到 <html> 的行内变量上，优先级高于预设。
 *
 * @param {string} [value]
 */
function applyStyle(value = getSettings().style) {
  const style = STYLE_OPTIONS.includes(value) ? value : DEFAULT_SETTINGS.style;

  document.documentElement.dataset.style = style;
  applyCustomTheme(style === 'custom' ? currentCustomTheme() : null);
}

/**
 * 写入 / 清理自定义主题变量
 *
 * @param {{accent: string, bg: string, surface: string, radius: number}|null} custom
 */
function applyCustomTheme(custom) {
  const root = document.documentElement;
  const managed = ['--accent', '--accent-soft', '--bg', '--surface', '--topbar', '--radius'];

  if (!custom) {
    managed.forEach((prop) => root.style.removeProperty(prop));
    return;
  }

  const accent = normalizeHex(custom.accent, DEFAULT_SETTINGS.customTheme.accent);
  const bg = normalizeHex(custom.bg, DEFAULT_SETTINGS.customTheme.bg);
  const surface = normalizeHex(custom.surface, DEFAULT_SETTINGS.customTheme.surface);
  const radius = Math.min(20, Math.max(4, Number(custom.radius) || DEFAULT_SETTINGS.customTheme.radius));
  const dark = document.documentElement.dataset.theme === 'dark';

  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-soft', hexToRgba(accent, dark ? 0.18 : 0.14));
  root.style.setProperty('--radius', `${radius}px`);

  // 深色模式只换主色与圆角，浅色底会破坏深色可读性
  if (dark) {
    root.style.removeProperty('--bg');
    root.style.removeProperty('--surface');
    root.style.removeProperty('--topbar');
  } else {
    root.style.setProperty('--bg', bg);
    root.style.setProperty('--surface', surface);
    root.style.setProperty('--topbar', hexToRgba(bg, 0.94));
  }
}

/** #rgb / #rrggbb → #rrggbb，非法值回退 */
function normalizeHex(value, fallback) {
  const text = String(value || '').trim().toLowerCase();

  if (/^#[0-9a-f]{6}$/.test(text)) {
    return text;
  }

  if (/^#[0-9a-f]{3}$/.test(text)) {
    return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
  }

  return fallback;
}

/** #rrggbb + 透明度 → rgba() */
function hexToRgba(hex, alpha) {
  const value = normalizeHex(hex, '#000000');

  return `rgba(${parseInt(value.slice(1, 3), 16)}, ${parseInt(value.slice(3, 5), 16)}, ${parseInt(
    value.slice(5, 7),
    16
  )}, ${alpha})`;
}

function formatDate(timestamp) {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const pad = (value) => String(value).padStart(2, '0');

  if (isToday) {
    return `今天 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  const pad = (value) => String(value).padStart(2, '0');

  return `${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 模板名来自主题文件，拼进 innerHTML 前统一转义 */
function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 退回 execCommand
    }
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();

  try {
    document.execCommand('copy');
  } catch {
    // 忽略，调用方按返回值判断
  }

  area.remove();
  return true;
}

// ─── 列表 ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

// 请求序号：筛选 / 搜索快速切换时只认最后一次请求，避免旧结果覆盖新列表
let listSeq = 0;

/**
 * 拉取文章列表
 *
 * 列表按页加载：首次 reset，点「加载更多」时按当前页号继续拉，
 * 服务端返回 total 时以 total 判断是否还有下一页，否则用「本页是否满 50 条」兜底。
 *
 * @param {{reset?: boolean}} [options]
 */
async function loadPosts({ reset = true } = {}) {
  if (!isConfigured()) {
    openSettings();
    return;
  }

  if (reset) {
    state.page = 1;
    state.hasMore = true;
  }

  if (!state.hasMore) {
    return;
  }

  const seq = (listSeq += 1);
  state.listLoading = true;
  updateListMore();

  if (reset) {
    // 首次加载（列表还是空的）用骨架屏，已有内容时保留列表只显示顶部提示
    const showSkeleton = !state.posts.length;
    el.listSkeleton.hidden = !showSkeleton;
    el.listLoading.hidden = showSkeleton;

    if (!showSkeleton) {
      el.listLoading.textContent = '加载中…';
    }
  }

  try {
    const query = { page: state.page, size: PAGE_SIZE };

    // 草稿 / 已发布 / 定时交给服务端过滤，否则分页总数与翻页都对不上
    if (['draft', 'publish', 'scheduled'].includes(state.filter)) {
      query.status = state.filter;
    }

    // 搜索走服务端标题检索，否则只能搜到已加载的几页
    if (state.query.trim()) {
      query.keyword = state.query.trim();
    }

    // 分类筛选交给服务端 JOIN，才能保证分页总数正确
    if (state.category) {
      query.mid = state.category;
    }

    const data = await call('posts', { query });

    // 期间又发起了新请求，本次结果已过期，直接丢弃
    if (seq !== listSeq) {
      return;
    }

    const items = data.items || [];
    const exists = new Set(reset ? [] : state.posts.map((item) => item.cid));
    const merged = reset ? [] : [...state.posts];

    items.forEach((item) => {
      if (!exists.has(item.cid)) {
        merged.push(item);
      }
    });

    state.posts = merged;
    state.total = typeof data.total === 'number' ? data.total : merged.length;
    state.hasMore =
      typeof data.total === 'number' ? merged.length < data.total : items.length >= PAGE_SIZE;

    renderList();
    el.listSkeleton.hidden = true;
    el.listLoading.hidden = true;

    // 首屏刷新时顺带更新待审核角标（翻页不重复请求）
    if (reset) {
      refreshPendingBadge();

      // 能拉到列表说明网络已恢复，顺带补发队列；60 秒内不重复尝试
      if (listQueue().length && Date.now() - lastFlushAt > 60000) {
        flushQueue({ silent: true });
      }
    }
  } catch (error) {
    if (seq !== listSeq) {
      return;
    }

    toast(error.message);

    if (reset) {
      state.posts = [];
      renderList();
      el.listSkeleton.hidden = true;
      el.listLoading.hidden = false;
      el.listLoading.textContent = '加载失败，下拉重试';
    } else {
      // 这一页没拉到，回退页号，下次「加载更多」重试同一页
      state.page = Math.max(1, state.page - 1);
    }

    // 保留重试机会
    state.hasMore = true;
  } finally {
    // 只由最新一次请求收尾，避免过期请求把新请求的 loading 状态清掉
    if (seq === listSeq) {
      state.listLoading = false;
      updateListMore();
    }
  }
}

function localDraftItems() {
  return listDrafts().filter((draft) => String(draft.id).startsWith('draft-'));
}

/**
 * 当前筛选条件下应展示的服务端文章
 *
 * 「全选」与列表渲染共用同一套过滤规则，避免出现「看得见却选不中」。
 */
function visibleServerItems() {
  const keyword = state.query.trim().toLowerCase();
  const { filter } = state;

  return state.posts.filter((item) => {
    if (filter === 'local') {
      return false;
    }

    if (filter === 'publish' && item.status !== 'publish') {
      return false;
    }

    if (filter === 'draft' && item.status !== 'draft') {
      return false;
    }

    if (filter === 'scheduled' && !item.scheduled) {
      return false;
    }

    return !keyword || String(item.title || '').toLowerCase().includes(keyword);
  });
}

function renderList() {
  const keyword = state.query.trim().toLowerCase();
  const { filter } = state;

  updateListMore();
  updateListHeader();

  const serverItems = visibleServerItems();

  const showLocal = filter === 'all' || filter === 'local' || filter === 'draft';
  const drafts = showLocal
    ? localDraftItems().filter((draft) => {
        if (keyword && !String(draft.title || '').toLowerCase().includes(keyword)) {
          return false;
        }

        // 选了分类时，本地草稿也按所属分类过滤
        if (state.category && !(draft.mid || []).map(Number).includes(state.category)) {
          return false;
        }

        return true;
      })
    : [];

  el.listItems.innerHTML = '';
  el.listEmpty.hidden = drafts.length + serverItems.length > 0;

  if (!drafts.length && !serverItems.length) {
    el.listEmpty.hidden = false;
    syncEmptyState();

    if (state.selecting) {
      updateBatchBar();
    }

    return;
  }

  // 本地草稿与服务端文章合并后按时间倒序，再按「今天 / 昨天 / 本周 / 更早」分组
  const entries = [];

  drafts.forEach((draft) => {
    entries.push({
      at: (draft.updatedAt || Date.now()) / 1000,
      // 本地草稿同样尊重置顶开关，否则勾了置顶却仍落在「今天」分组
      pinned: Boolean(draft.pinned),
      node: createItem({
        key: draft.id,
        title: draft.title || '未命名草稿',
        time: formatDate((draft.updatedAt || Date.now()) / 1000),
        status: 'local',
        item: {
          local: true,
          id: draft.id,
          title: draft.title,
          text: draft.text,
          pinned: Boolean(draft.pinned),
        },
      }),
    });
  });

  serverItems.forEach((item) => {
    // 本地草稿比服务端新：说明上次改动没同步上去，列表上给出提示。
    // 列表没有正文，标题与缩略名都一致时视为「只是打开过」，不再误报
    const local = readDraft(String(item.cid));
    const unsynced = Boolean(
      local &&
        (local.updatedAt || 0) > (item.modified || 0) * 1000 &&
        postDraftSummaryDiffers(local, item),
    );

    entries.push({
      at: item.created,
      pinned: Boolean(item.pinned),
      node: createItem({
        key: `post-${item.cid}`,
        title: item.title || '未命名文档',
        time: formatDate(item.created),
        status: item.scheduled ? 'scheduled' : item.status === 'draft' ? 'draft' : 'published',
        unsynced,
        item: { local: false, ...item },
      }),
    });
  });

  // 置顶优先，其余仍按时间倒序
  entries.sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }

    return b.at - a.at;
  });

  const fragment = document.createDocumentFragment();
  let currentGroup = '';

  entries.forEach(({ at, node, pinned }) => {
    const group = pinned ? '置顶' : groupLabel(at);

    if (group !== currentGroup) {
      currentGroup = group;

      const title = document.createElement('h2');
      title.className = 'list-group-title';
      title.textContent = group;
      fragment.appendChild(title);
    }

    fragment.appendChild(node);
  });

  el.listItems.appendChild(fragment);
  el.listSkeleton.hidden = true;
  el.listLoading.hidden = true;

  if (state.selecting) {
    updateBatchBar();
  }
}

/** 空态文案：有筛选条件时说明原因，并给出清除入口 */
function syncEmptyState() {
  const filtered = state.filter !== 'all' || Boolean(state.query.trim()) || state.category > 0;

  if (el.emptyTitle) {
    el.emptyTitle.textContent = filtered ? '没有匹配的文章' : '还没有文章';
  }

  if (el.emptyDesc) {
    el.emptyDesc.textContent = filtered ? '换个筛选条件或清空搜索试试' : '点右下角开始写第一篇';
  }

  if (el.clearFilters) {
    el.clearFilters.hidden = !filtered;
  }
}

/** 列表顶部大标题与数量 */
function updateListHeader() {
  if (!el.listTitle) {
    return;
  }

  const labels = {
    all: '全部文章',
    publish: '已发布',
    draft: '草稿',
    scheduled: '定时',
    local: '本地草稿',
  };

  el.listTitle.textContent = labels[state.filter] || '全部文章';

  const localCount = localDraftItems().length;
  const total = state.filter === 'local' ? localCount : state.total || state.posts.length;
  const suffix = state.hasMore && state.filter !== 'local' ? '+' : '';

  el.listCount.textContent = total ? `${total}${suffix}` : '';
}

/** 文章列表只有标题、缩略名与置顶：都一致时视为「只是打开过」，不再标「本地有改动」 */
function postDraftSummaryDiffers(draft, item) {
  return (
    String(draft.title ?? '') !== String(item.title ?? '') ||
    String(draft.slug ?? '') !== String(item.slug ?? '') ||
    Boolean(draft.pinned) !== Boolean(item.pinned)
  );
}

/**
 * 分组标签：未来 / 今天 / 昨天 / 本周 / 更早
 *
 * 定时发布文章的 created 在未来，不能被算进「今天」，否则未来几天的稿子
 * 会和今天混在一起，用户无法从分组看出哪些还没上线。
 */
function groupLabel(timestamp) {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = date.getTime();

  if (time >= startOfToday + 86400000) {
    return '未来';
  }

  if (time >= startOfToday) {
    return '今天';
  }

  if (time >= startOfToday - 86400000) {
    return '昨天';
  }

  if (time >= startOfToday - 6 * 86400000) {
    return '本周';
  }

  return '更早';
}

/** 「加载更多」只在远端还有下一页且当前不是本地草稿筛选时出现 */
function updateListMore() {
  if (!el.listMore) {
    return;
  }

  el.listMore.hidden = state.filter === 'local' || !state.hasMore;
  el.listMore.textContent = state.listLoading ? '加载中…' : '加载更多';
  el.listMore.disabled = state.listLoading;
}

function createItem({ title, badge = '', time, status = '', unsynced = false, item }) {
  const wrap = document.createElement('div');
  wrap.className = 'post-item';

  // 供评论数同步等操作按 cid 精确定位到行
  if (item.cid) {
    wrap.dataset.cid = String(item.cid);
  }

  // status 只在文章列表传：页面列表沿用彩色徽标
  if (status) {
    wrap.classList.add(`status-${status}`);
  }

  if (unsynced) {
    wrap.classList.add('unsynced');
  }

  // 本地草稿还没同步到服务端，无法批量改状态，保持正常打开行为
  const selectable = state.selecting && !item.local;

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'post-main';
  main.innerHTML = '<div class="post-title"></div><div class="post-meta"></div>';
  main.querySelector('.post-title').textContent = title;

  const statusLabels = {
    published: '已发布',
    draft: '草稿',
    scheduled: '定时',
    local: '本地草稿',
  };
  const meta = [];

  if (status) {
    meta.push(`<span class="post-state">${statusLabels[status] || status}</span>`);
  } else if (badge) {
    meta.push(badge);
  }

  if (item.pinned) {
    meta.push('<span class="post-state pin">置顶</span>');
  }

  if (unsynced) {
    meta.push('<span class="post-state notice">本地有改动</span>');
  }

  meta.push(`<span>${time}</span>`);
  main.querySelector('.post-meta').innerHTML = meta.join('');
  main.addEventListener('click', () => {
    if (selectable) {
      toggleSelect(item.cid, wrap);
      return;
    }

    if (item.local) {
      if (item.kind === 'page') {
        openLocalPageDraft(item.id);
      } else {
        openLocalDraft(item.id);
      }
    } else if (item.kind === 'page') {
      openPage(item.cid);
    } else if (item.status === 'publish' && !item.scheduled && openPreference() === 'preview') {
      // 已发布文章默认先看成品，草稿 / 定时稿仍直接进编辑器
      previewPost(item.cid);
    } else {
      openPost(item.cid);
    }
  });

  if (selectable) {
    wrap.classList.add('selectable');

    if (state.selectedCids.has(item.cid)) {
      wrap.classList.add('selected');
    }

    const check = document.createElement('span');
    check.className = 'post-check';
    check.textContent = '✓';
    wrap.appendChild(check);
  }

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'post-more';
  more.setAttribute('aria-label', '更多操作');
  more.textContent = '⋯';
  more.addEventListener('click', (event) => {
    event.stopPropagation();
    openItemSheet(item);
  });

  wrap.appendChild(main);

  // 多选模式下「更多」让位给勾选框，避免误触
  if (!state.selecting) {
    buildItemTools(item).forEach((node) => wrap.appendChild(node));
    wrap.appendChild(more);
  }

  return wrap;
}

/**
 * 列表项右侧的快捷入口：评论 / 预览
 *
 * 评论入口只对已发布的文章显示；按设置选「直接编辑」时额外给一个预览按钮。
 *
 * @param {object} item
 * @returns {HTMLElement[]}
 */
function buildItemTools(item) {
  if (item.local || item.kind === 'page' || item.status !== 'publish') {
    return [];
  }

  const tools = [];
  const count = Number(item.comments || 0);

  const comment = document.createElement('button');
  comment.type = 'button';
  comment.className = 'post-tool';
  comment.dataset.role = 'comment';
  comment.setAttribute('aria-label', count ? `查看评论，共 ${count} 条` : '查看评论');
  comment.innerHTML = `${COMMENT_ICON}${count ? `<span class="post-tool-count">${count > 99 ? '99+' : count}</span>` : ''}`;
  comment.addEventListener('click', (event) => {
    event.stopPropagation();
    previewPost(item.cid);
  });
  tools.push(comment);

  if (openPreference() === 'edit' && !item.scheduled) {
    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'post-tool';
    preview.setAttribute('aria-label', '预览');
    preview.innerHTML = PREVIEW_ICON;
    preview.addEventListener('click', (event) => {
      event.stopPropagation();
      previewPost(item.cid);
    });
    tools.push(preview);
  }

  return tools;
}

/**
 * 已发布文章的打开方式：preview 先看成品 / edit 直接编辑
 *
 * @returns {'preview'|'edit'}
 */
function openPreference() {
  return (getSettings().postOpenMode || DEFAULT_SETTINGS.postOpenMode) === 'edit'
    ? 'edit'
    : 'preview';
}

// ─── 待发布队列 ──────────────────────────────────────────────────────────

// 同一时间只跑一轮重试，避免启动、联网事件与列表刷新重复触发
let queueBusy = false;
let lastFlushAt = 0;
let queueClearArmed = false;
let queueClearTimer = 0;

/** 队列条：告诉用户还有内容没发出去 */
function renderQueueBar() {
  if (!el.queueBar) {
    return;
  }

  const list = listQueue();

  el.queueBar.hidden = list.length === 0;

  if (!list.length) {
    return;
  }

  const title = list[0].title || '未命名';
  const more = list.length > 1 ? ` 等 ${list.length} 篇` : '';
  const hint = list[0].error ? '上次重试失败，可再试' : '联网后自动重试';

  el.queueText.textContent = `待发布：${title}${more} · ${hint}`;
}

function updateQueueButtons(busy) {
  [el.queueRetry, el.queueClear].forEach((button) => {
    if (button) {
      button.disabled = busy;
    }
  });

  if (el.queueRetry) {
    el.queueRetry.textContent = busy ? '发送中…' : '重试';
  }
}

/**
 * 依次重试待发布队列
 *
 * 遇到第一条失败就停：大概率仍然没网，继续请求只会再堆几个超时。
 *
 * @param {{silent?: boolean}} options silent 为 true 时只在补发后提示
 */
async function flushQueue({ silent = true } = {}) {
  if (queueBusy || !isConfigured()) {
    return;
  }

  const list = listQueue();

  renderQueueBar();

  if (!list.length) {
    return;
  }

  queueBusy = true;
  lastFlushAt = Date.now();
  updateQueueButtons(true);

  let sent = 0;
  let error = '';

  try {
    for (const item of list) {
      try {
        const result = await call('save', { method: 'POST', body: item.body });
        const draftKey = item.draftKey || '';

        pushHistory(String(result.cid), { title: item.title, text: item.body?.text || '' });
        removeQueue(item.id);

        // 已经落库：只清理内容仍是这份快照的本地草稿，
        // 用户断网后继续改过的草稿保留，避免把新内容删掉
        if (draftKey) {
          const draft = readDraft(draftKey);
          const same = !draft
            || (String(draft.text || '') === String(item.body.text || '')
              && String(draft.title || '') === String(item.body.title || ''));

          if (same) {
            removeDraft(draftKey);

            if (draftKey !== String(result.cid)) {
              clearHistory(draftKey);
            }
          }
        }

        sent += 1;
      } catch (err) {
        failQueue(item.id, err.message);
        error = err.message;
        break;
      }
    }
  } finally {
    queueBusy = false;
    updateQueueButtons(false);
    renderQueueBar();
  }

  if (sent && state.view === 'list' && !state.listLoading) {
    loadPosts({ reset: true });
  }

  if (sent) {
    toast(silent ? `已自动补发 ${sent} 篇` : `已补发 ${sent} 篇`);
  } else if (!silent && error) {
    toast(`重试失败：${error}`);
  }
}

/** 队列条交互：手动重试 + 二次确认清空 */
function bindQueue() {
  el.queueRetry?.addEventListener('click', () => flushQueue({ silent: false }));

  if (!el.queueClear) {
    return;
  }

  el.queueClear.addEventListener('click', () => {
    if (!queueClearArmed) {
      queueClearArmed = true;
      el.queueClear.textContent = '确认清空';
      window.clearTimeout(queueClearTimer);
      queueClearTimer = window.setTimeout(() => {
        queueClearArmed = false;
        el.queueClear.textContent = '清空';
      }, 3000);
      return;
    }

    window.clearTimeout(queueClearTimer);
    queueClearArmed = false;
    el.queueClear.textContent = '清空';
    clearQueue();
    renderQueueBar();
    toast('已清空待发布队列');
  });
}

/**
 * 待审核评论角标
 *
 * 只在管理模式开启且服务器配置完整时显示；数字来自 overview 的 pendingComments。
 * 拉取失败保持原状，不弹提示——角标属于锦上添花，不该打断写作。
 *
 * @param {number} num
 */
function setTabBadge(num) {
  if (!el.tabBadge) {
    return;
  }

  const count = Math.max(0, Number(num) || 0);

  el.tabBadge.hidden = count === 0;
  el.tabBadge.textContent = count > 99 ? '99+' : String(count);
}

async function refreshPendingBadge() {
  if (!adminReady()) {
    setTabBadge(0);
    return;
  }

  try {
    const data = await callAdmin('overview');

    setTabBadge(Number(data?.pendingComments || 0));
  } catch {
    // 网络或权限问题：保留上一次的数字
  }
}

/**
 * 审核评论后同步列表里的评论数
 *
 * 后端返回的 commentsNum 是该文章最新总数，比本地加减更可靠。
 *
 * @param {number} cid
 * @param {number} num
 */
function syncCommentCount(cid, num) {
  const item = state.posts.find((post) => Number(post.cid) === Number(cid));

  if (item) {
    item.comments = num;
  }

  const tools = el.listItems.querySelectorAll(
    `.post-item[data-cid="${cid}"] .post-tool[data-role="comment"]`,
  );

  tools.forEach((tool) => {
    const count = Math.max(0, Number(num) || 0);

    tool.setAttribute('aria-label', count ? `查看评论，共 ${count} 条` : '查看评论');

    let badge = tool.querySelector('.post-tool-count');

    if (!count) {
      badge?.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'post-tool-count';
      tool.appendChild(badge);
    }

    badge.textContent = count > 99 ? '99+' : String(count);
  });
}

/**
 * 打开文章预览
 *
 * @param {number} cid
 */
function previewPost(cid) {
  // 从编辑器回来时，预览的返回目标是首页而不是编辑器
  state.detailFrom = state.view === 'editor' ? 'list' : state.view;
  show('detail');
  openPostDetail(cid);
}

/**
 * 打开说说详情（评论即这条说说下的回复）
 *
 * @param {object} item
 */
function previewShuoshuo(item) {
  state.detailFrom = state.view;
  show('detail');
  openShuoshuoDetail(item);
}

/** 关闭预览，回到进入前的视图 */
function closeDetail() {
  resetDetail();
  show(state.detailFrom || 'list');
}

// ─── 批量选择 ────────────────────────────────────────────────────────────

let batchArmed = false;
let batchTimer = null;

/**
 * 进 / 出多选模式
 *
 * @param {boolean} on
 */
function setSelectMode(on) {
  state.selecting = on;
  state.selectedCids.clear();
  resetBatchConfirm();

  el.views.list.classList.toggle('selecting', on);
  el.batchBar.hidden = !on;
  el.selectBtn.classList.toggle('active', on);
  el.selectBtn.setAttribute('aria-label', on ? '退出批量选择' : '批量选择');

  renderList();
  updateBatchBar();
}

/** 列表筛选条件变化后，清掉可能已不可见的批量选择，避免改到看不见的文章 */
function resetBatchSelection() {
  if (!state.selecting || state.selectedCids.size === 0) {
    return;
  }

  state.selectedCids.clear();
  updateBatchBar();
}

function toggleSelect(cid, node) {
  if (state.selectedCids.has(cid)) {
    state.selectedCids.delete(cid);
    node.classList.remove('selected');
  } else {
    state.selectedCids.add(cid);
    node.classList.add('selected');
  }

  resetBatchConfirm();
  updateBatchBar();
}

function updateBatchBar() {
  if (!el.batchBar) {
    return;
  }

  const count = state.selectedCids.size;
  const items = visibleServerItems();
  const allSelected =
    items.length > 0 && items.every((item) => state.selectedCids.has(item.cid));

  el.batchCount.textContent = `已选 ${count} 篇`;
  el.batchAll.textContent = allSelected ? '取消全选' : '全选';
  el.batchPublish.disabled = count === 0;
  el.batchDraft.disabled = count === 0;
}

/** 复位「转草稿」的二次确认状态 */
function resetBatchConfirm() {
  batchArmed = false;
  clearTimeout(batchTimer);

  if (el.batchDraft) {
    el.batchDraft.textContent = '转草稿';
    el.batchDraft.classList.remove('armed');
  }
}

// 服务端单次最多处理 50 篇，超出时前端分片串行提交
const BATCH_LIMIT = 50;

/**
 * 执行批量改状态
 *
 * @param {'publish'|'draft'} status
 */
async function runBatch(status) {
  const cids = [...state.selectedCids];

  if (!cids.length) {
    toast('请先选择文章');
    return;
  }

  el.batchPublish.disabled = true;
  el.batchDraft.disabled = true;

  let count = 0;
  let skipped = 0;

  try {
    for (let offset = 0; offset < cids.length; offset += BATCH_LIMIT) {
      const chunk = cids.slice(offset, offset + BATCH_LIMIT);
      const data = await call('postBatch', { method: 'POST', body: { cids: chunk, status } });

      count += Number(data?.count) || 0;
      skipped += Number(data?.skipped) || 0;
    }

    const label = status === 'publish' ? '已发布' : '已转为草稿';

    setSelectMode(false);
    await loadPosts({ reset: true });
    toast(skipped > 0 ? `${label} ${count} 篇，跳过 ${skipped} 篇` : `${label} ${count} 篇`);
  } catch (error) {
    // 分片提交中途失败时说明已完成的数量，避免用户以为一篇都没改
    toast(count > 0 ? `已处理 ${count} 篇，后续失败：${error.message}` : error.message);
    updateBatchBar();
  }
}

// ─── 文章操作抽屉 ────────────────────────────────────────────────────────

function addItemAction(label, handler, danger = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'item-action' + (danger ? ' danger' : '');
  button.textContent = label;
  button.addEventListener('click', handler);
  el.itemActions.appendChild(button);

  return button;
}

function openItemSheet(item) {
  state.item = item;
  el.itemTitle.textContent = item.title || '未命名文档';
  el.itemActions.innerHTML = '';

  if (item.local) {
    addItemAction('继续编辑', () => {
      closeItemSheet();

      if (item.kind === 'page') {
        openLocalPageDraft(item.id);
      } else {
        openLocalDraft(item.id);
      }
    });

    addItemAction('复制正文', async () => {
      await copyText(item.text || '');
      closeItemSheet();
      toast('正文已复制');
    });

    let armed = false;
    const button = addItemAction(
      '删除本地草稿',
      () => {
        if (!armed) {
          armed = true;
          button.textContent = '再次点击确认删除';
          return;
        }

        removeDraft(item.id);
        // 历史版本按草稿键存储，不一起删会在 localStorage 里永久残留
        clearHistory(item.id);
        closeItemSheet();

        if (item.kind === 'page') {
          renderPages();
        } else {
          renderList();
        }

        toast('已删除本地草稿');
      },
      true,
    );
  } else if (item.kind === 'page') {
    addItemAction('编辑页面', () => {
      closeItemSheet();
      openPage(item.cid);
    });

    addItemAction('在浏览器打开', async () => {
      try {
        const detail = await call('page', { query: { cid: item.cid } });
        closeItemSheet();
        await openInBrowser(detail?.url);
      } catch (error) {
        toast(error.message);
      }
    });

    addItemAction('复制链接', async () => {
      try {
        const detail = await call('page', { query: { cid: item.cid } });
        await copyText(detail?.url || '');
        closeItemSheet();
        toast('已复制');
      } catch (error) {
        toast(error.message);
      }
    });

    let armed = false;
    const button = addItemAction(
      '删除页面',
      async () => {
        if (!armed) {
          armed = true;
          button.textContent = '再次点击确认删除';
          return;
        }

        button.disabled = true;

        try {
          await call('pageDelete', { method: 'POST', body: { cid: item.cid } });
          removeDraft(`page-${item.cid}`);
          clearHistory(`page-${item.cid}`);
          closeItemSheet();
          await loadPages({ reset: true });
          toast('已删除');
        } catch (error) {
          button.disabled = false;
          toast(error.message);
        }
      },
      true,
    );
  } else {
    addItemAction('打开', () => {
      closeItemSheet();
      openPost(item.cid);
    });

    // 草稿在线上不可访问，预览入口只对草稿以外的文章开放
    if (item.status !== 'draft') {
      addItemAction('在浏览器打开', async () => {
        try {
          const detail = await call('post', { query: { cid: item.cid } });
          closeItemSheet();
          await openInBrowser(detail?.url);
        } catch (error) {
          toast(error.message);
        }
      });
    }

    addItemAction(item.status === 'draft' ? '复制文章 ID' : '复制文章链接', async () => {
      try {
        // 永久链接规则可能不是 /{slug}（如 /archives/{cid}/），由服务端按路由生成
        const detail = item.status === 'draft' ? null : await call('post', { query: { cid: item.cid } });
        await copyText(detail?.url || String(item.cid));
        closeItemSheet();
        toast('已复制');
      } catch (error) {
        toast(error.message);
      }
    });

    let armed = false;
    const button = addItemAction(
      item.status === 'draft' ? '删除草稿' : '删除文章',
      async () => {
        if (!armed) {
          armed = true;
          button.textContent = '再次点击确认删除';
          return;
        }

        button.disabled = true;

        try {
          await call('delete', { method: 'POST', body: { cid: item.cid } });
          removeDraft(String(item.cid));
          clearHistory(String(item.cid));
          closeItemSheet();
          await loadPosts();
          toast('已删除');
        } catch (error) {
          button.disabled = false;
          toast(error.message);
        }
      },
      true,
    );
  }

  showSheet(el.itemSheet, el.itemMask);
}

function closeItemSheet() {
  hideSheet(el.itemSheet, el.itemMask);
}

// ─── 编辑 ────────────────────────────────────────────────────────────────

function fillSheet(data) {
  const tagNames = String(data.tags || '')
    .split(/[,，]/)
    .map((name) => name.trim())
    .filter(Boolean);

  state.selectedTagNames = new Set(tagNames);
  el.tags.value = '';
  renderTagChips();

  el.summary.value = data.summary || '';
  el.albumText.value = data.album || '';
  el.thumb.value = data.thumb || '';
  el.reprint.value = data.reprint || 'standard';
  el.pinned.checked = Boolean(data.pinned);
  el.slug.value = data.slug || '';
  el.created.value = '';

  // 服务器返回了 imagePost，本地草稿沿用保存时的标记
  state.imagePost = Boolean(data.imagePost);

  const mids = Array.isArray(data.mid) ? data.mid.map(Number) : [];
  state.selectedMids = new Set(mids);
  renderCategoryChips();
  syncAlbumField();
}

/**
 * 相册分类（slug=image）的 mid，未加载到分类时返回 0
 */
function albumCategoryMid() {
  const meta = state.categories.find((item) => item.slug === 'image');

  return meta ? Number(meta.mid) : 0;
}

/**
 * 「相册描述」只在文章属于相册分类时出现
 *
 * 分类元数据加载完成后，一律以当前选中的分类为准：把文章从相册分类移走后，
 * 字段要立刻隐藏，不能再用打开时的 imagePost 快照兜底，否则旧描述会被继续提交。
 * 元数据还没加载时（首次进入编辑器）才退回服务端返回的 imagePost。
 */
function syncAlbumField() {
  const mid = albumCategoryMid();
  const isAlbum = state.metasLoaded
    ? mid > 0 && state.selectedMids.has(mid)
    : Boolean(state.imagePost);

  el.albumField.hidden = !isAlbum;

  if (!isAlbum) {
    el.albumText.value = '';
  }
}

function currentFields() {
  const fields = {
    summary: el.summary.value.trim(),
    customSummary: el.summary.value.trim(),
    thumb: el.thumb.value.trim(),
    reprint: el.reprint.value,
  };

  // 只在字段可见时提交：普通文章不传 album，服务端会保留原值
  if (!el.albumField.hidden) {
    fields.album = el.albumText.value.trim();
  }

  return fields;
}

/**
 * 拉取分类 / 标签元数据
 *
 * @param {{silent?: boolean}} [options] silent 用于首页静默加载筛选项，失败不打扰用户
 */
async function ensureMetas({ silent = false } = {}) {
  if (state.metasLoaded) {
    renderCategoryChips();
    renderTagChips();
    renderListCategories();
    return;
  }

  try {
    const data = await call('metas');
    state.categories = data.categories || [];
    state.tags = data.tags || [];
    state.metasLoaded = true;
    renderCategoryChips();
    renderTagChips();
    renderListCategories();
    // 分类加载完成后再判断一次相册字段，新建文章时才知道相册分类的 mid
    syncAlbumField();
  } catch (error) {
    if (!silent) {
      toast(`分类加载失败：${error.message}`);
    }
  }
}

/** 列表顶部的分类筛选下拉：只在元数据加载完成后渲染一次 */
function renderListCategories() {
  if (!el.listCategory) {
    return;
  }

  const current = String(state.category || '');
  el.listCategory.innerHTML = '<option value="">全部分类</option>';

  state.categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = String(category.mid);
    option.textContent = category.name;
    el.listCategory.appendChild(option);
  });

  el.listCategory.value = current;
}

/** 已选标签 + 输入框里新输入的标签，去重后返回 */
function collectTags() {
  const names = new Set(state.selectedTagNames);

  el.tags.value
    .split(/[,，]/)
    .map((name) => name.trim())
    .filter(Boolean)
    .forEach((name) => names.add(name));

  return [...names];
}

function renderTagChips() {
  el.tagChips.innerHTML = '';

  const known = new Set(state.tags.map((tag) => tag.name));
  const names = state.tags.map((tag) => tag.name);

  // 已选但不在历史标签里的（例如刚手输的），也渲染出来便于取消
  for (const name of state.selectedTagNames) {
    if (!known.has(name)) {
      names.push(name);
    }
  }

  el.tagChips.hidden = names.length === 0;

  for (const name of names) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (state.selectedTagNames.has(name) ? ' active' : '');
    chip.textContent = name;
    chip.addEventListener('click', () => {
      if (state.selectedTagNames.has(name)) {
        state.selectedTagNames.delete(name);
      } else {
        state.selectedTagNames.add(name);
      }
      chip.classList.toggle('active');
      refreshCheck();
      markDirty();
    });
    el.tagChips.appendChild(chip);
  }
}

function renderCategoryChips() {
  el.categoryChips.innerHTML = '';

  for (const category of state.categories) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (state.selectedMids.has(category.mid) ? ' active' : '');
    chip.textContent = category.name;
    chip.addEventListener('click', () => {
      if (state.selectedMids.has(category.mid)) {
        state.selectedMids.delete(category.mid);
      } else {
        state.selectedMids.add(category.mid);
      }
      chip.classList.toggle('active');
      // 同步 imagePost 快照：本地草稿在分类元数据未加载时靠它还原相册字段，
      // 不跟随选择更新的话，取消相册分类后旧快照会一直生效
      const albumMid = albumCategoryMid();
      state.imagePost = albumMid > 0 && state.selectedMids.has(albumMid);
      syncAlbumField();
      refreshCheck();
      markDirty();
    });
    el.categoryChips.appendChild(chip);
  }
}

function startEditor({
  cid,
  draftKey,
  title,
  text,
  meta,
  kind = 'post',
  url = '',
  pageMeta = null,
}) {
  state.cid = cid;
  state.draftKey = draftKey;
  state.kind = kind;
  state.currentUrl = url || '';
  state.pageMeta = pageMeta;
  state.dirty = false;
  // 每次进入编辑器重新给一次配额提示机会
  state.quotaWarned = false;
  el.title.value = title || '';
  fillSheet(meta || {});
  el.editorStatus.textContent = cid ? '已保存' : kind === 'page' ? '新页面' : '新文章';

  // 页面复用同一套编辑器，但保存语义不同：设置走抽屉，「保存」直接提交
  $('#btn-save').textContent = kind === 'page' ? '设置' : '保存';
  $('#btn-publish').textContent = kind === 'page' ? '保存' : '发布';
  el.preview.hidden = !state.currentUrl;

  show('editor');

  initEditor({
    value: text || '',
    mode: getSettings().editorMode,
    onChange: () => {
      markDirty();
    },
    getCid: () => state.cid,
    onError: (message) => toast(message),
    // 编辑器内切换模式后记住选择，下次打开文章沿用
    onModeChange: (mode) => {
      saveSettings({ ...getSettings(), editorMode: mode });
      toast(`已切换到${EDITOR_MODE_LABELS[mode] || '新'}模式`);
    },
  });
}

const EDITOR_MODE_LABELS = {
  ir: '即时渲染',
  wysiwyg: '所见即所得',
  sv: '分屏预览',
  code: '纯代码',
};

/** 标记有未保存改动：状态栏、自动保存与离开时的兜底都依赖这个标记 */
function markDirty() {
  state.dirty = true;
  el.editorStatus.textContent = '编辑中…';
  scheduleAutosave();
}

function scheduleAutosave() {
  clearTimeout(state.autosaveTimer);
  state.autosaveTimer = setTimeout(() => {
    const saved = persistLocal();
    maybeSnapshot();
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // 写失败时不能继续显示「已存本地」，否则用户会以为内容已经落盘
    el.editorStatus.textContent = saved ? `已存本地 ${time}` : '本地保存失败';
  }, 1200);
}

/**
 * 写入本地草稿
 *
 * @returns {boolean} 是否成功落盘（没有草稿键时视为无需保存）
 */
function persistLocal() {
  if (!state.draftKey) {
    return true;
  }

  const data = {
    cid: state.cid,
    kind: state.kind,
    title: el.title.value,
    text: getEditorValue(),
    mid: [...state.selectedMids],
    tags: collectTags().join(','),
    summary: el.summary.value,
    album: el.albumText.value,
    imagePost: state.imagePost,
    thumb: el.thumb.value,
    reprint: el.reprint.value,
    pinned: el.pinned.checked,
    slug: el.slug.value,
    created: el.created.value,
  };

  // 页面没有分类 / 标签，额外保存模板、状态、排序等页面设置
  if (state.kind === 'page' && state.pageMeta) {
    data.slug = state.pageMeta.slug || '';
    data.originalSlug = state.pageMeta.originalSlug || '';
    data.template = state.pageMeta.template || '';
    data.status = state.pageMeta.status || 'publish';
    data.order = Number(state.pageMeta.order || 0);
    data.allowComment = state.pageMeta.allowComment !== false;
  }

  const saved = writeDraft(state.draftKey, data);

  // 配额溢出时只提示一次，避免每次自动保存都弹 toast
  if (!saved && !state.quotaWarned) {
    state.quotaWarned = true;
    toast('本地存储空间不足，草稿未能保存，请清理历史版本后重试');
  }

  return saved;
}

/**
 * 记录历史版本：自动保存时每分钟最多一版，离开编辑器时强制记一版
 *
 * @param {boolean} force 是否忽略节流
 */
function maybeSnapshot(force = false) {
  if (!state.draftKey) {
    return;
  }

  const text = getEditorValue();

  if (!String(text).trim()) {
    return;
  }

  const latest = readHistory(state.draftKey)[0];

  if (!force && latest && Date.now() - latest.at < 60000) {
    return;
  }

  pushHistory(state.draftKey, { title: el.title.value, text });
}

function openNew() {
  if (!isConfigured()) {
    openSettings();
    return;
  }

  state.status = 'draft';

  startEditor({
    cid: 0,
    draftKey: newDraftId(),
    title: '',
    text: '',
    meta: {},
  });
}

function openLocalDraft(id) {
  const draft = readDraft(id);

  if (!draft) {
    toast('草稿已不存在');
    renderList();
    return;
  }

  state.status = 'draft';
  state.selectedMids = new Set(draft.mid || []);

  startEditor({
    cid: 0,
    draftKey: id,
    title: draft.title || '',
    text: draft.text || '',
    meta: { ...draft, mid: [...state.selectedMids] },
  });
}

/**
 * 判断本地草稿与服务端文章是否存在实质差异
 */
function draftDiffers(draft, post) {
  const pairs = [
    [draft.title, post.title],
    [draft.text, post.text],
    [draft.summary, post.fields?.summary ?? ''],
    [draft.album ?? '', post.fields?.album ?? ''],
    [draft.thumb, post.fields?.thumb ?? ''],
    [draft.reprint ?? 'standard', post.fields?.reprint ?? 'standard'],
    [draft.slug, post.slug],
    [draft.tags, post.tags],
    [draft.pinned ? '1' : '0', post.pinned ? '1' : '0'],
  ];

  if (pairs.some(([local, remote]) => String(local ?? '') !== String(remote ?? ''))) {
    return true;
  }

  const localMids = Array.isArray(draft.mid) ? [...draft.mid].map(Number).sort() : [];
  const remoteMids = (post.categories || []).map(Number).sort();

  return JSON.stringify(localMids) !== JSON.stringify(remoteMids);
}

async function openPost(cid) {
  const seq = (openDetailSeq += 1);
  const fromView = state.view;

  // 从预览页点「编辑」进来的，保存或返回后仍回预览，方便对照成品
  if (fromView === 'detail') {
    state.returnView = 'detail';
  }

  try {
    const post = await call('post', { query: { cid } });

    // 期间用户又点了别的文章或离开了入口视图：丢弃这次结果，避免串文章
    if (seq !== openDetailSeq || state.view !== fromView) {
      return;
    }

    const local = readDraft(String(cid));
    // 时间更新且内容确实不同才恢复本地：打开过文章也会落一份草稿，
    // 不能仅凭时间戳把它判成「本地更新」，否则会把网页端的修改回滚
    const useLocal = Boolean(
      local && local.updatedAt > post.modified * 1000 && draftDiffers(local, post),
    );
    const source = useLocal ? local : {};

    state.status = post.status;
    state.selectedMids = new Set(source.mid || post.categories || []);

    startEditor({
      cid: post.cid,
      draftKey: String(post.cid),
      title: source.title ?? post.title,
      text: source.text ?? post.text,
      url: post.url || '',
      meta: {
        tags: source.tags ?? post.tags,
        summary: source.summary ?? post.fields?.summary ?? '',
        album: source.album ?? post.fields?.album ?? '',
        thumb: source.thumb ?? post.fields?.thumb ?? '',
        reprint: source.reprint ?? post.fields?.reprint ?? 'standard',
        pinned: source.pinned ?? post.pinned,
        slug: source.slug ?? post.slug,
        mid: [...state.selectedMids],
        imagePost: Boolean(post.imagePost),
      },
    });

    if (useLocal) {
      toast('已恢复本地草稿');
    }
  } catch (error) {
    if (seq !== openDetailSeq || state.view !== fromView) {
      return;
    }

    toast(error.message);
  }
}

function backToList() {
  // 输入后 1.2 秒内返回时防抖计时器会被清掉，这里补一次落盘与快照，避免丢内容。
  // 只有真正改动过才写：打开后原样返回不应生成「本地草稿」，
  // 否则列表会把每篇打开过的文章都标成「本地有改动」
  if (state.draftKey && state.dirty) {
    persistLocal();
    maybeSnapshot(true);
  }

  const kind = state.kind;

  destroyEditor();
  clearTimeout(state.autosaveTimer);
  state.dirty = false;
  state.draftKey = '';

  // 页面编辑器返回页面列表，而不是首页文章列表
  if (kind === 'page') {
    const pagesBody = document.getElementById('pages-body');
    const scroll = pagesBody ? pagesBody.scrollTop : 0;

    show('pages');
    renderPages();

    if (pagesBody) {
      requestAnimationFrame(() => {
        pagesBody.scrollTop = scroll;
      });
    }

    return;
  }

  // 从相册 / 日历进入的编辑，保存或返回后回来源视图，避免跳到首页
  if (state.returnView === 'detail') {
    state.returnView = '';
    previewPost(state.cid);
    return;
  }

  if (state.returnView === 'album') {
    state.returnView = '';
    show('album');
    loadAlbum({ reset: true });
    return;
  }

  if (state.returnView === 'calendar') {
    state.returnView = '';
    show('calendar');
    loadCalendar();
    return;
  }

  // 编辑器是独立视图，此时列表 DOM 还保留着上一次的渲染结果，先记住滚动位置
  const body = document.getElementById('list-body');
  const scroll = body ? body.scrollTop : 0;

  show('list');
  renderList();

  if (body) {
    requestAnimationFrame(() => {
      body.scrollTop = scroll;
    });
  }

  // 已经加载过分页就保留；只有空列表（首次进入或上次加载失败）才重新拉取
  if (!state.posts.length) {
    loadPosts({ reset: true });
  }
}

// ─── 时光机（说说） ──────────────────────────────────────────────────────

const SHUOSHUO_PAGE_SIZE = 20;

const shuoshuo = {
  items: [],
  page: 1,
  hasMore: true,
  loading: false,
  seq: 0,
  images: [],
  submitting: false,
  // 正在编辑的说说 coid，null 表示新建
  editing: null,
};

/**
 * 打开时光机
 *
 * 每次进入都重新拉第一页，保证在网页端发过说说后 App 也能及时看到。
 */
function openShuoshuo() {
  if (!isConfigured()) {
    openSettings();
    return;
  }

  show('shuoshuo');
  loadShuoshuo({ reset: true });
}

async function loadShuoshuo({ reset = true } = {}) {
  if (!isConfigured()) {
    openSettings();
    return;
  }

  if (reset) {
    shuoshuo.page = 1;
    shuoshuo.hasMore = true;
  } else if (!shuoshuo.hasMore || shuoshuo.loading) {
    return;
  }

  const seq = (shuoshuo.seq += 1);
  shuoshuo.loading = true;
  updateShuoshuoMore();

  if (reset && !shuoshuo.items.length) {
    el.shuoshuoLoading.hidden = false;
    el.shuoshuoLoading.textContent = '加载中…';
  }

  try {
    const data = await call('shuoshuo', {
      query: { page: shuoshuo.page, size: SHUOSHUO_PAGE_SIZE },
    });

    if (seq !== shuoshuo.seq) {
      return;
    }

    const items = data.items || [];

    if (reset) {
      shuoshuo.items = items;
    } else {
      const exists = new Set(shuoshuo.items.map((item) => item.coid));
      items.forEach((item) => {
        if (!exists.has(item.coid)) {
          shuoshuo.items.push(item);
        }
      });
    }

    shuoshuo.hasMore =
      typeof data.total === 'number'
        ? shuoshuo.items.length < data.total
        : items.length >= SHUOSHUO_PAGE_SIZE;

    renderShuoshuo();
  } catch (error) {
    if (seq !== shuoshuo.seq) {
      return;
    }

    toast(error.message);

    if (reset) {
      // 刷新失败时保留已有内容，只有首次加载失败才展示错误占位
      if (!shuoshuo.items.length) {
        renderShuoshuo();
        el.shuoshuoLoading.hidden = false;
        el.shuoshuoLoading.textContent = '加载失败，下拉重试';
      }
    } else {
      shuoshuo.page = Math.max(1, shuoshuo.page - 1);
    }

    shuoshuo.hasMore = true;
  } finally {
    if (seq === shuoshuo.seq) {
      shuoshuo.loading = false;
      updateShuoshuoMore();
    }
  }
}

function renderShuoshuo() {
  updateShuoshuoMore();
  el.shuoshuoItems.innerHTML = '';
  el.shuoshuoEmpty.hidden = shuoshuo.items.length > 0;
  el.shuoshuoLoading.hidden = true;

  const fragment = document.createDocumentFragment();

  shuoshuo.items.forEach((item) => {
    fragment.appendChild(createShuoshuoItem(item));
  });

  el.shuoshuoItems.appendChild(fragment);
}

function updateShuoshuoMore() {
  if (!el.shuoshuoMore) {
    return;
  }

  el.shuoshuoMore.hidden = !shuoshuo.hasMore;
  el.shuoshuoMore.textContent = shuoshuo.loading ? '加载中…' : '加载更多';
  el.shuoshuoMore.disabled = shuoshuo.loading;
}

/**
 * 单条说说
 *
 * 文本直接按纯文本展示，图片交给下方网格，避免把 Markdown 源码露给用户。
 */
function createShuoshuoItem(item) {
  const wrap = document.createElement('article');
  wrap.className = 'shuoshuo-item';

  const head = document.createElement('div');
  head.className = 'shuoshuo-head';

  const meta = document.createElement('div');
  meta.className = 'shuoshuo-meta';

  if (item.secret) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = '私密';
    meta.appendChild(badge);
  }

  const time = document.createElement('span');
  time.textContent = formatDate(item.created);
  meta.appendChild(time);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'shuoshuo-delete';
  remove.textContent = '删除';

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'shuoshuo-delete';
  edit.textContent = '编辑';
  edit.addEventListener('click', () => openShuoshuoSheet(item));

  const actions = document.createElement('div');
  actions.className = 'shuoshuo-actions';
  actions.append(edit, remove);

  // 两步确认：第一次点击进入确认态，4 秒内再点一次才真正删除
  let armed = false;
  let timer = 0;
  remove.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      remove.textContent = '确认删除';
      remove.classList.add('armed');
      timer = window.setTimeout(() => {
        armed = false;
        remove.textContent = '删除';
        remove.classList.remove('armed');
      }, 4000);
      return;
    }

    window.clearTimeout(timer);
    remove.disabled = true;

    try {
      await call('shuoshuoDelete', { method: 'POST', body: { coid: item.coid } });
      shuoshuo.items = shuoshuo.items.filter((row) => row.coid !== item.coid);
      renderShuoshuo();
      toast('已删除');
    } catch (error) {
      remove.disabled = false;
      toast(error.message);
    }
  });

  head.appendChild(meta);
  head.appendChild(actions);
  wrap.appendChild(head);

  if (item.plain) {
    const text = document.createElement('p');
    text.className = 'shuoshuo-text';
    text.textContent = item.plain;
    wrap.appendChild(text);
  }

  if (Array.isArray(item.images) && item.images.length) {
    const grid = document.createElement('div');
    grid.className = item.images.length === 1 ? 'shuoshuo-images single' : 'shuoshuo-images';

    item.images.forEach((url) => {
      const image = document.createElement('img');
      image.src = url;
      image.alt = '';
      image.loading = 'lazy';
      grid.appendChild(image);
    });

    wrap.appendChild(grid);
  }

  // 底部的评论入口：点击进详情看回复，站长可当场审核
  const comments = Number(item.replies || 0);
  const commentBar = document.createElement('button');
  commentBar.type = 'button';
  commentBar.className = 'shuoshuo-comment';
  commentBar.innerHTML = `${COMMENT_ICON}<span>${comments ? `评论 ${comments}` : '评论'}</span>`;
  commentBar.addEventListener('click', () => previewShuoshuo(item));
  wrap.appendChild(commentBar);

  return wrap;
}

function openShuoshuoSheet(item = null) {
  shuoshuo.editing = item ? item.coid : null;
  shuoshuo.images = [];
  el.shuoshuoText.value = item ? item.text : '';
  el.shuoshuoSecret.checked = Boolean(item && item.secret);
  el.shuoshuoSheetTitle.textContent = item ? '编辑说说' : '发一条说说';
  $('#btn-shuoshuo-submit').textContent = item ? '保存' : '发布';
  renderShuoshuoUploads();
  showSheet(el.shuoshuoSheet, el.shuoshuoMask);

  window.setTimeout(() => el.shuoshuoText.focus(), 280);
}

function closeShuoshuoSheet() {
  hideSheet(el.shuoshuoSheet, el.shuoshuoMask);
  shuoshuo.editing = null;
  shuoshuo.images = [];
}

function renderShuoshuoUploads() {
  el.shuoshuoUploads.innerHTML = '';
  el.shuoshuoUploads.hidden = shuoshuo.images.length === 0;

  shuoshuo.images.forEach((url, index) => {
    const cell = document.createElement('div');
    cell.className = 'shuoshuo-upload';

    const image = document.createElement('img');
    image.src = url;
    image.alt = '';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'shuoshuo-upload-remove';
    remove.setAttribute('aria-label', '移除图片');
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      shuoshuo.images.splice(index, 1);
      renderShuoshuoUploads();
    });

    cell.appendChild(image);
    cell.appendChild(remove);
    el.shuoshuoUploads.appendChild(cell);
  });
}

async function pickShuoshuoImages() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;

  input.addEventListener('change', async () => {
    const files = [...(input.files || [])];

    if (!files.length) {
      return;
    }

    const button = $('#btn-shuoshuo-image');
    button.disabled = true;
    button.textContent = '上传中…';

    try {
      const results = await Promise.allSettled(files.map((file) => uploadImage(file, 0)));
      let failed = 0;

      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value?.url) {
          shuoshuo.images.push(result.value.url);
        } else {
          failed += 1;
        }
      });

      renderShuoshuoUploads();

      if (failed) {
        toast(`${failed} 张图片上传失败`);
      }
    } finally {
      button.disabled = false;
      button.textContent = '添加图片';
    }
  });

  input.click();
}

async function submitShuoshuo() {
  if (shuoshuo.submitting) {
    return;
  }

  const text = el.shuoshuoText.value.trim();

  if (!text && !shuoshuo.images.length) {
    toast('先写点什么，或者加一张图片');
    return;
  }

  const images = shuoshuo.images.map((url) => `![](${url})`).join('\n');
  const content = [text, images].filter(Boolean).join('\n\n');
  const button = $('#btn-shuoshuo-submit');
  const editing = shuoshuo.editing;

  shuoshuo.submitting = true;
  button.disabled = true;
  button.textContent = editing ? '保存中…' : '发布中…';

  try {
    if (editing) {
      const item = await call('shuoshuoUpdate', {
        method: 'POST',
        body: { coid: editing, text: content, secret: el.shuoshuoSecret.checked },
      });

      closeShuoshuoSheet();

      // 保持原有顺序，避免编辑后条目跳到列表顶部
      const index = shuoshuo.items.findIndex((row) => row.coid === editing);

      if (index >= 0) {
        shuoshuo.items[index] = item;
      }

      renderShuoshuo();
      toast('已更新');
      return;
    }

    const item = await call('shuoshuoCreate', {
      method: 'POST',
      body: { text: content, secret: el.shuoshuoSecret.checked },
    });

    closeShuoshuoSheet();
    shuoshuo.items.unshift(item);

    if (state.view !== 'shuoshuo') {
      show('shuoshuo');
    }

    renderShuoshuo();
    toast('已发布');
  } catch (error) {
    toast(error.message);
  } finally {
    shuoshuo.submitting = false;
    button.disabled = false;
    button.textContent = editing ? '保存' : '发布';
  }
}

// ─── 相册 ────────────────────────────────────────────────────────────────

const ALBUM_PAGE_SIZE = 18;

/** 相册里的最大图片数，与网页端编辑习惯保持一致 */
const ALBUM_MAX_IMAGES = 9;

const album = {
  items: [],
  page: 1,
  hasMore: true,
  loading: false,
  seq: 0,
  // 服务端返回的相册分类 mid，0 表示博客里没有 slug=image 的分类
  mid: 0,
  name: '',
  // 相册文章总数（不是图片数）
  total: 0,
  // 是否成功拉到过一次数据：区分「没有分类」与「加载失败」
  loaded: false,
  // 发相册抽屉里待发布的图片地址
  images: [],
  submitting: false,
  // 浏览层当前展示的文章
  viewing: null,
  viewerIndex: 0,
};

let albumDeleteArmed = false;
let albumDeleteTimer = 0;

/**
 * 默认标题：2026-11-25 的照片
 */
function defaultAlbumTitle(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} 的照片`;
}

function openAlbum() {
  if (!isConfigured()) {
    openSettings();
    return;
  }

  show('album');
  loadAlbum({ reset: true });
}

async function loadAlbum({ reset = true } = {}) {
  if (reset) {
    album.page = 1;
    album.hasMore = true;
  }

  if (!album.hasMore) {
    return;
  }

  const seq = (album.seq += 1);
  album.loading = true;
  updateAlbumMore();

  if (reset) {
    el.albumLoading.hidden = false;
    el.albumLoading.textContent = '加载中…';
  }

  try {
    const data = await call('album', { query: { page: album.page, size: ALBUM_PAGE_SIZE } });

    if (seq !== album.seq) {
      return;
    }

    album.mid = Number(data?.mid || 0);
    album.name = String(data?.name || '');
    album.total = Number(data?.total || 0);
    album.loaded = true;

    const items = Array.isArray(data?.items) ? data.items : [];
    const exists = new Set(album.items.map((item) => item.cid));

    album.items = reset
      ? items
      : album.items.concat(items.filter((item) => !exists.has(item.cid)));
    album.hasMore =
      typeof data?.total === 'number' ? album.items.length < data.total : items.length >= ALBUM_PAGE_SIZE;

    renderAlbum();
    el.albumLoading.hidden = true;
  } catch (error) {
    if (seq !== album.seq) {
      return;
    }

    toast(error.message);

    if (reset) {
      album.items = [];
      renderAlbum();
      el.albumLoading.hidden = false;
      el.albumLoading.textContent = '加载失败，下拉重试';
    } else {
      album.page = Math.max(1, album.page - 1);
      album.hasMore = true;
    }
  } finally {
    if (seq === album.seq) {
      album.loading = false;
      updateAlbumMore();
    }
  }
}

function updateAlbumMore() {
  el.albumMore.hidden = !album.hasMore || album.items.length === 0;
  el.albumMore.textContent = album.loading ? '加载中…' : '加载更多';
  el.albumMore.disabled = album.loading;
}

function renderAlbum() {
  updateAlbumMore();
  el.albumGrid.innerHTML = '';

  // 还没成功拉到过数据时不显示空态，交给 loading 文案提示「加载失败」
  if (!album.loaded) {
    el.albumEmpty.hidden = true;
    el.albumSummary.hidden = true;
    return;
  }

  const title = el.albumEmpty.querySelector('.empty-title');
  const desc = el.albumEmpty.querySelector('.empty-desc');

  if (album.mid === 0) {
    el.albumEmpty.hidden = false;
    el.albumSummary.hidden = true;
    title.textContent = '没有找到相册分类';
    desc.textContent = '博客里需要一个缩略名为 image 的分类';
    return;
  }

  el.albumEmpty.hidden = album.items.length > 0;
  el.albumSummary.hidden = album.items.length === 0;
  el.albumSummary.textContent = `共 ${album.total} 组照片`;
  title.textContent = '还没有照片';
  desc.textContent = '点右上角「发照片」发布第一组';

  const fragment = document.createDocumentFragment();
  album.items.forEach((item) => fragment.appendChild(createAlbumCard(item)));
  el.albumGrid.appendChild(fragment);
}

function createAlbumCard(item) {
  const card = document.createElement('div');
  card.className = 'album-card';
  card.setAttribute('role', 'button');
  card.tabIndex = 0;

  const cover = document.createElement('span');
  cover.className = 'album-cover';

  if (item.cover) {
    const image = document.createElement('img');
    image.alt = '';
    image.loading = 'lazy';
    // 淡入，避免网格里的封面逐张弹出
    image.addEventListener('load', () => image.classList.add('loaded'));
    // 图片挂了也给出占位，避免网格里出现空洞
    image.addEventListener('error', () => {
      image.remove();
      cover.classList.add('empty');

      const fallback = document.createElement('span');
      fallback.textContent = '无图';
      cover.prepend(fallback);
    });
    image.src = item.cover;

    // 命中缓存时 load 可能早于监听，直接补一次
    if (image.complete) {
      image.classList.add('loaded');
    }

    cover.appendChild(image);
  } else {
    cover.classList.add('empty');
    cover.textContent = '无图';
  }

  if (Number(item.count) > 1) {
    const count = document.createElement('span');
    count.className = 'album-count';
    count.textContent = String(item.count);
    cover.appendChild(count);
  }

  const title = document.createElement('span');
  title.className = 'album-card-title';
  title.textContent = item.title || '未命名';

  const date = document.createElement('span');
  date.className = 'album-card-date';
  date.textContent = formatDate(item.created);

  card.append(cover, title, date);

  // 评论入口浮在封面右上角，点卡片仍然是看图
  const comments = Number(item.comments || 0);
  if (comments > 0) {
    const badge = document.createElement('span');
    badge.className = 'album-comments';
    badge.innerHTML = COMMENT_ICON + `<span>${comments > 99 ? '99+' : comments}</span>`;
    badge.setAttribute('aria-label', `查看评论，共 ${comments} 条`);
    badge.addEventListener('click', (event) => {
      event.stopPropagation();
      previewPost(item.cid);
    });
    card.appendChild(badge);
  }

  card.addEventListener('click', () => openAlbumViewer(item));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openAlbumViewer(item);
    }
  });

  return card;
}

/* ─── 图片浏览 ─────────────────────────────────────────────────────────── */

function openAlbumViewer(item) {
  const images = Array.isArray(item.images) && item.images.length
    ? item.images
    : (item.cover ? [item.cover] : []);

  if (!images.length) {
    toast('这篇相册还没有图片');
    return;
  }

  album.viewing = item;
  album.viewerIndex = 0;
  resetAlbumDelete();

  el.albumViewerTrack.innerHTML = '';

  images.forEach((url) => {
    const slide = document.createElement('div');
    slide.className = 'album-slide';

    const image = document.createElement('img');
    image.src = url;
    image.alt = '';

    slide.appendChild(image);
    el.albumViewerTrack.appendChild(slide);
  });

  el.albumViewerCaption.textContent = [item.title, item.count ? `${item.count} 张` : '']
    .filter(Boolean)
    .join(' · ');
  updateAlbumViewerCount();
  el.albumViewer.hidden = false;
  syncModalLock();
  // 等布局完成再归零，避免 display:none 期间设置 scrollLeft 不生效
  requestAnimationFrame(() => {
    el.albumViewerTrack.scrollLeft = 0;
  });
}

function updateAlbumViewerCount() {
  const total = el.albumViewerTrack.childElementCount;

  el.albumViewerCount.textContent = total ? `${album.viewerIndex + 1} / ${total}` : '';
}

function closeAlbumViewer() {
  el.albumViewer.hidden = true;
  el.albumViewerTrack.innerHTML = '';
  album.viewing = null;
  resetAlbumDelete();
  syncModalLock();
}

function resetAlbumDelete() {
  albumDeleteArmed = false;
  window.clearTimeout(albumDeleteTimer);
  $('#album-viewer-delete').classList.remove('warn');
}

async function editAlbumPost() {
  const item = album.viewing;

  if (!item) {
    return;
  }

  closeAlbumViewer();
  state.returnView = 'album';
  await openPost(item.cid);

  // 打开失败时 openPost 内部只 toast，这里清掉标记，避免下次返回误跳相册
  if (state.view !== 'editor') {
    state.returnView = '';
  }
}

async function deleteAlbumPost() {
  const item = album.viewing;

  if (!item) {
    return;
  }

  const button = $('#album-viewer-delete');

  // 两步确认：第一次点亮按钮，4 秒内再点才真正删除
  if (!albumDeleteArmed) {
    albumDeleteArmed = true;
    button.classList.add('warn');
    toast('再点一次删除这篇相册');
    albumDeleteTimer = window.setTimeout(resetAlbumDelete, 4000);
    return;
  }

  resetAlbumDelete();
  button.disabled = true;

  try {
    await call('delete', { method: 'POST', body: { cid: item.cid } });
    removeDraft(String(item.cid));
    clearHistory(String(item.cid));

    const removed = item.cid;
    closeAlbumViewer();
    album.items = album.items.filter((row) => row.cid !== removed);
    renderAlbum();
    toast('已删除');
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

/* ─── 发照片 ───────────────────────────────────────────────────────────── */

function openAlbumSheet() {
  if (album.mid === 0) {
    toast('博客里需要一个缩略名为 image 的分类');
    return;
  }

  album.images = [];
  el.albumTitle.value = defaultAlbumTitle();
  el.albumDesc.value = '';
  renderAlbumPicker();
  showSheet(el.albumSheet, el.albumSheetMask);

  // 打开抽屉后直接拉起系统相册，少一次点击；抽屉被关掉就不再打扰
  window.setTimeout(() => {
    if (!el.albumSheet.hidden) {
      pickAlbumImages();
    }
  }, 280);
}

function closeAlbumSheet() {
  hideSheet(el.albumSheet, el.albumSheetMask);
}

function renderAlbumPicker() {
  el.albumPicker.innerHTML = '';
  el.albumPicker.hidden = album.images.length === 0;

  album.images.forEach((url, index) => {
    const cell = document.createElement('div');
    cell.className = 'album-pick';

    const image = document.createElement('img');
    image.src = url;
    image.alt = '';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'album-pick-remove';
    remove.setAttribute('aria-label', '移除照片');
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      album.images.splice(index, 1);
      renderAlbumPicker();
    });

    cell.append(image, remove);
    el.albumPicker.appendChild(cell);
  });
}

function pickAlbumImages() {
  const input = document.createElement('input');
  const button = $('#btn-album-pick');

  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;

  input.addEventListener('change', async () => {
    const picked = [...(input.files || [])];

    if (!picked.length) {
      return;
    }

    const room = ALBUM_MAX_IMAGES - album.images.length;

    if (room <= 0) {
      toast(`一篇相册最多 ${ALBUM_MAX_IMAGES} 张`);
      return;
    }

    const files = picked.slice(0, room);

    if (picked.length > room) {
      toast(`只能再放 ${room} 张`);
    }

    button.disabled = true;

    try {
      // 两张一批：弱网下同时挤满上行容易整批超时
      for (let i = 0; i < files.length; i += 2) {
        const batch = files.slice(i, i + 2);
        button.textContent = `上传中 ${Math.min(i + 2, files.length)}/${files.length}`;

        const results = await Promise.allSettled(batch.map((file) => uploadImage(file, 0)));
        let failed = 0;

        results.forEach((result) => {
          if (result.status === 'fulfilled' && result.value?.url) {
            album.images.push(result.value.url);
          } else {
            failed += 1;
          }
        });

        renderAlbumPicker();

        if (failed) {
          toast(`${failed} 张照片上传失败`);
        }
      }
    } finally {
      button.disabled = false;
      button.textContent = '添加照片';
    }
  });

  input.click();
}

async function submitAlbum(isDraft) {
  if (album.submitting) {
    return;
  }

  if (!album.images.length) {
    toast('先添加至少一张照片');
    return;
  }

  const title = el.albumTitle.value.trim() || defaultAlbumTitle();
  const desc = el.albumDesc.value.trim();
  const button = isDraft ? $('#btn-album-draft') : $('#btn-album-submit');

  album.submitting = true;
  button.disabled = true;
  button.textContent = isDraft ? '保存中…' : '发布中…';

  try {
    // 正文只放图片：主题会把相册分类文章里的 img 解析成图片墙，文字会被丢弃，
    // 描述统一写 fields.album，由主题显示在文章标题下方
    const text = album.images.map((url) => `![](${url})`).join('\n\n');

    await call('save', {
      method: 'POST',
      body: {
        cid: 0,
        isDraft,
        title,
        text,
        mid: [album.mid],
        fields: {
          thumb: album.images[0],
          album: desc,
          summary: desc,
        },
      },
    });

    closeAlbumSheet();
    toast(isDraft ? '已存为草稿' : '已发布到相册');

    if (!isDraft) {
      // Handsome 的相册分类页有渲染缓存，清一次让网页端立即出现新照片；
      // 管理接口没开启时会失败，忽略即可
      try {
        await callAdmin('clearCache');
      } catch {
        // 静默：清缓存只是加速手段
      }

      await loadAlbum({ reset: true });
      // 新照片在最前面，回到顶部才能看到
      $('#album-body').scrollTop = 0;
    }
  } catch (error) {
    toast(error.message);
  } finally {
    album.submitting = false;
    button.disabled = false;
    button.textContent = isDraft ? '存草稿' : '发布';
  }
}

// ─── 发布日历 ────────────────────────────────────────────────────────────

const calendar = {
  month: '',
  days: {},
  items: [],
  selected: '',
  loading: false,
  seq: 0,
};

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function dateKey(date) {
  return `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`;
}

function openCalendar() {
  if (!isConfigured()) {
    openSettings();
    return;
  }

  const now = new Date();
  calendar.month = monthKey(now);
  calendar.selected = dateKey(now);
  show('calendar');
  loadCalendar();
}

async function loadCalendar({ fallbackMonth = '' } = {}) {
  const seq = (calendar.seq += 1);
  calendar.loading = true;
  el.calendarLoading.hidden = false;

  try {
    const data = await call('calendar', { query: { month: calendar.month } });

    if (seq !== calendar.seq) {
      return;
    }

    calendar.month = String(data?.month || calendar.month);
    calendar.days = data?.days || {};
    calendar.items = Array.isArray(data?.items) ? data.items : [];

    renderCalendar();
  } catch (error) {
    if (seq !== calendar.seq) {
      return;
    }

    // 切月失败时回退到原月份，保证标题、网格、明细与 calendar.month 同源
    if (fallbackMonth) {
      calendar.month = fallbackMonth;
      renderCalendar();
    }

    toast(error.message);
  } finally {
    if (seq === calendar.seq) {
      calendar.loading = false;
      el.calendarLoading.hidden = true;
    }
  }
}

function shiftCalendarMonth(delta) {
  const [year, mon] = calendar.month.split('-').map(Number);
  const next = new Date(year, mon - 1 + delta, 1);
  const prev = calendar.month;

  calendar.month = monthKey(next);
  calendar.selected = '';
  loadCalendar({ fallbackMonth: prev });
}

function renderCalendar() {
  const [year, mon] = calendar.month.split('-').map(Number);
  el.calendarTitle.textContent = `${year} 年 ${mon} 月`;

  const first = new Date(year, mon - 1, 1);
  // 周一为一周起点：getDay() 周日是 0，要排到第 6 格
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, mon, 0).getDate();
  const today = dateKey(new Date());

  el.calendarGrid.innerHTML = '';

  for (let i = 0; i < offset; i += 1) {
    const blank = document.createElement('span');
    blank.className = 'calendar-blank';
    el.calendarGrid.appendChild(blank);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const key = `${calendar.month}-${String(day).padStart(2, '0')}`;
    const stat = calendar.days[key] || {};
    const total =
      Number(stat.publish || 0) + Number(stat.scheduled || 0) + Number(stat.draft || 0);

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'calendar-day';
    cell.classList.toggle('today', key === today);
    cell.classList.toggle('active', key === calendar.selected);

    const number = document.createElement('span');
    number.className = 'calendar-day-num';
    number.textContent = String(day);

    const dots = document.createElement('span');
    dots.className = 'calendar-dots';

    ['publish', 'scheduled', 'draft'].forEach((type) => {
      if (Number(stat[type] || 0) > 0) {
        const dot = document.createElement('i');
        dot.className = `dot ${type}`;
        dots.appendChild(dot);
      }
    });

    cell.append(number, dots);

    if (total > 0) {
      cell.title = `${total} 篇`;
    }

    cell.addEventListener('click', () => {
      calendar.selected = key;
      renderCalendar();
    });

    el.calendarGrid.appendChild(cell);
  }

  renderCalendarDay();
}

function renderCalendarDay() {
  el.calendarItems.innerHTML = '';

  if (!calendar.selected) {
    el.calendarDayTitle.textContent = '选择一天查看';
    return;
  }

  const [year, mon, day] = calendar.selected.split('-').map(Number);
  el.calendarDayTitle.textContent = `${mon} 月 ${day} 日的文章`;

  const items = calendar.items.filter((item) => item.day === calendar.selected);

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'calendar-empty';
    empty.textContent = '这一天没有发布或排期';
    el.calendarItems.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'calendar-item';

    const time = document.createElement('span');
    time.className = 'calendar-item-time';
    time.textContent = formatClock(item.created);

    const title = document.createElement('span');
    title.className = 'calendar-item-title';
    title.textContent = item.title || '未命名文档';

    const badge = document.createElement('span');
    badge.className = `badge${item.status === 'draft' ? ' draft' : item.status === 'scheduled' ? ' scheduled' : ''}`;
    badge.textContent = item.status === 'draft' ? '草稿' : item.status === 'scheduled' ? '定时' : '已发布';

    row.append(time, title, badge);
    row.addEventListener('click', () => {
      state.returnView = 'calendar';
      openPost(item.cid).then(() => {
        if (state.view !== 'editor') {
          state.returnView = '';
        }
      });
    });

    el.calendarItems.appendChild(row);
  });
}

function formatClock(timestamp) {
  const date = new Date(timestamp * 1000);

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// ─── 独立页面 ────────────────────────────────────────────────────────────

const PAGES_PAGE_SIZE = 30;

const pages = {
  items: [],
  total: 0,
  page: 1,
  hasMore: true,
  loading: false,
  seq: 0,
  templates: {},
};

/** 首页、管理页与「我的」宫格都能打开页面列表 */
function openPages(from = 'list') {
  if (!isConfigured()) {
    openSettings();
    return;
  }

  state.pagesFrom = from === 'admin' ? 'admin' : (from === 'me' ? 'me' : 'list');
  show('pages');
  loadPages({ reset: true });
}

/** 页面列表返回：回到进入前的视图 */
function closePages() {
  const from = state.pagesFrom;

  state.pagesFrom = 'list';
  show(from === 'admin' ? 'admin' : (from === 'me' ? 'me' : 'list'));
}

async function loadPages({ reset = true } = {}) {
  if (!isConfigured()) {
    openSettings();
    return;
  }

  if (reset) {
    pages.page = 1;
    pages.hasMore = true;
  } else if (!pages.hasMore || pages.loading) {
    return;
  }

  const seq = (pages.seq += 1);
  pages.loading = true;
  updatePagesMore();

  if (reset && !pages.items.length) {
    el.pagesLoading.hidden = false;
    el.pagesLoading.textContent = '加载中…';
  }

  try {
    const data = await call('pages', {
      query: { page: pages.page, size: PAGES_PAGE_SIZE },
    });

    if (seq !== pages.seq) {
      return;
    }

    const items = data.items || [];

    if (reset) {
      pages.items = items;
    } else {
      const exists = new Set(pages.items.map((item) => item.cid));
      items.forEach((item) => {
        if (!exists.has(item.cid)) {
          pages.items.push(item);
        }
      });
    }

    pages.total = Number(data.total || 0);
    pages.templates = data.templates || pages.templates;
    pages.hasMore =
      typeof data.total === 'number'
        ? pages.items.length < data.total
        : items.length >= PAGES_PAGE_SIZE;

    renderPages();
  } catch (error) {
    if (seq !== pages.seq) {
      return;
    }

    toast(error.message);

    if (reset) {
      // 刷新失败保留已有列表，只有首次加载失败才显示错误占位
      if (!pages.items.length) {
        renderPages();
        el.pagesLoading.hidden = false;
        el.pagesLoading.textContent = '加载失败，下拉重试';
      }
    } else {
      pages.page = Math.max(1, pages.page - 1);
    }

    pages.hasMore = true;
  } finally {
    if (seq === pages.seq) {
      pages.loading = false;
      updatePagesMore();
    }
  }
}

function pageDraftItems() {
  // 只有「新建页面」的草稿才是独立条目；已发布页面的本地缓冲（page-<cid>）
  // 在对应条目上以「本地有改动」呈现，避免同一页面出现两行、点错后新建重复页面
  return listDrafts().filter((draft) => String(draft.id).startsWith('page-draft-'));
}

/** 页面列表只带标题与缩略名，用它们做轻量差异判断，避免未修改也报「本地有改动」 */
function pageDraftSummaryDiffers(draft, page) {
  return (
    String(draft.title ?? '') !== String(page.title ?? '') ||
    String(draft.slug ?? '') !== String(page.slug ?? '')
  );
}

function renderPages() {
  updatePagesMore();
  el.pagesItems.innerHTML = '';

  const drafts = pageDraftItems();
  el.pagesEmpty.hidden = drafts.length + pages.items.length > 0;
  el.pagesLoading.hidden = true;

  if (!drafts.length && !pages.items.length) {
    return;
  }

  const fragment = document.createDocumentFragment();

  drafts.forEach((draft) => {
    fragment.appendChild(
      createItem({
        key: draft.id,
        title: draft.title || '未命名页面',
        badge: '<span class="badge local">本地草稿</span>',
        time: formatDate((draft.updatedAt || Date.now()) / 1000),
        item: { local: true, kind: 'page', id: draft.id, title: draft.title, text: draft.text },
      }),
    );
  });

  pages.items.forEach((item) => {
    const statusBadge = item.hidden
      ? '<span class="badge draft">隐藏</span>'
      : '<span class="badge">已发布</span>';
    const templateName = pages.templates[item.template];
    const templateBadge = templateName
      ? `<span class="badge local">${escapeHtml(templateName)}</span>`
      : '';
    const local = readDraft(`page-${item.cid}`);
    const unsynced = Boolean(
      local &&
        local.updatedAt > (item.modified || 0) * 1000 &&
        pageDraftSummaryDiffers(local, item),
    );

    fragment.appendChild(
      createItem({
        key: `page-${item.cid}`,
        title: item.title || '未命名页面',
        badge: statusBadge + templateBadge,
        time: formatDate(item.created),
        unsynced,
        item: { local: false, kind: 'page', ...item },
      }),
    );
  });

  el.pagesItems.appendChild(fragment);
}

function updatePagesMore() {
  if (!el.pagesMore) {
    return;
  }

  el.pagesMore.hidden = !pages.hasMore;
  el.pagesMore.textContent = pages.loading ? '加载中…' : '加载更多';
  el.pagesMore.disabled = pages.loading;
}

async function openPage(cid) {
  const seq = (openDetailSeq += 1);
  const fromView = state.view;

  try {
    const page = await call('page', { query: { cid } });

    // 期间用户又打开了别的页面或离开了页面列表：丢弃这次结果
    if (seq !== openDetailSeq || state.view !== fromView) {
      return;
    }

    const key = `page-${cid}`;
    const local = readDraft(key);
    // 与服务端对比后再决定是否恢复本地，避免把网页端的修改回滚
    const useLocal = Boolean(
      local && local.updatedAt > page.modified * 1000 && pageDraftDiffers(local, page),
    );
    const source = useLocal ? local : {};
    const templates = page.templates || {};

    if (Object.keys(templates).length) {
      pages.templates = templates;
    }

    state.status = page.status;

    startEditor({
      cid: page.cid,
      draftKey: key,
      kind: 'page',
      url: page.url || '',
      title: source.title ?? page.title,
      text: source.text ?? page.text,
      meta: {},
      pageMeta: {
        slug: source.slug ?? page.slug,
        // 服务端只校验「用户主动修改」的缩略名，这里记住原值以便同样放行旧中文 slug
        originalSlug: page.slug || '',
        template: source.template ?? (page.template || ''),
        status: source.status ?? page.status,
        order: source.order ?? Number(page.order || 0),
        allowComment: source.allowComment ?? Number(page.allowComment) !== 0,
      },
    });

    if (useLocal) {
      toast('已恢复本地草稿');
    }
  } catch (error) {
    if (seq !== openDetailSeq || state.view !== fromView) {
      return;
    }

    toast(error.message);
  }
}

function openNewPage() {
  if (!isConfigured()) {
    openSettings();
    return;
  }

  state.status = 'publish';

  startEditor({
    cid: 0,
    draftKey: `page-${newDraftId()}`,
    kind: 'page',
    title: '',
    text: '',
    meta: {},
    pageMeta: { slug: '', originalSlug: '', template: '', status: 'publish', order: 0, allowComment: true },
  });
}

function openLocalPageDraft(id) {
  const draft = readDraft(id);

  if (!draft) {
    toast('草稿已不存在');
    renderPages();
    return;
  }

  state.status = draft.status || 'publish';

  startEditor({
    // 草稿里存了 cid：兼容旧版本误把已发布页面的本地缓冲塞进「新建草稿」的情况
    cid: Number(draft.cid) || 0,
    draftKey: id,
    kind: 'page',
    title: draft.title || '',
    text: draft.text || '',
    meta: {},
    pageMeta: {
      slug: draft.slug || '',
      // 旧草稿没有记录原始缩略名：以草稿值为准，避免误拦
      originalSlug: draft.originalSlug ?? draft.slug ?? '',
      template: draft.template || '',
      status: draft.status || 'publish',
      order: Number(draft.order || 0),
      allowComment: draft.allowComment !== false,
    },
  });
}

/** 本地页面草稿与服务端页面是否有实质差异 */
function pageDraftDiffers(draft, page) {
  const pairs = [
    [draft.title, page.title],
    [draft.text, page.text],
    [draft.slug ?? '', page.slug],
    [draft.template ?? '', page.template ?? ''],
    [draft.status ?? 'publish', page.status],
    [Number(draft.order || 0), Number(page.order || 0)],
  ];

  if (pairs.some(([local, remote]) => String(local ?? '') !== String(remote ?? ''))) {
    return true;
  }

  return (draft.allowComment !== false) !== (Number(page.allowComment) !== 0);
}

function renderPageTemplates(selected = '') {
  const templates = pages.templates || {};
  el.pageTemplate.innerHTML = '';

  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = '默认模板';
  el.pageTemplate.appendChild(empty);

  Object.entries(templates).forEach(([file, name]) => {
    const option = document.createElement('option');
    option.value = file;
    option.textContent = name || file;
    el.pageTemplate.appendChild(option);
  });

  // 模板文件已不在主题里时保留原值并标注，避免只改排序就把模板清空
  if (selected && !templates[selected]) {
    const stale = document.createElement('option');
    stale.value = selected;
    stale.textContent = `${selected}（模板已失效）`;
    el.pageTemplate.appendChild(stale);
  }

  el.pageTemplate.value = selected || '';
}

function openPageSheet() {
  const meta = state.pageMeta || {};
  renderPageTemplates(meta.template || '');
  el.pageStatus.value = meta.status === 'hidden' ? 'hidden' : 'publish';
  el.pageOrder.value = String(Number(meta.order || 0));
  el.pageSlug.value = meta.slug || '';
  el.pageAllowComment.checked = meta.allowComment !== false;
  showSheet(el.pageSheet, el.pageMask);
}

function closePageSheet() {
  hideSheet(el.pageSheet, el.pageMask);
}

function applyPageSheet() {
  state.pageMeta = {
    ...(state.pageMeta || {}),
    template: el.pageTemplate.value,
    status: el.pageStatus.value === 'hidden' ? 'hidden' : 'publish',
    order: Math.max(0, Number(el.pageOrder.value || 0) || 0),
    slug: el.pageSlug.value.trim(),
    allowComment: el.pageAllowComment.checked,
  };
  closePageSheet();
  markDirty();
}

async function submitPage() {
  const title = el.title.value.trim();
  const text = getEditorValue();

  if (!title) {
    toast('标题还没填');
    return;
  }

  if (!text.trim()) {
    toast('正文不能为空');
    return;
  }

  const meta = state.pageMeta || {};
  const slug = String(meta.slug || '').trim();

  // 与服务端一致：只有用户主动改动缩略名时才校验，旧的中文 slug 允许原样保存
  if (slug && slug !== String(meta.originalSlug || '') && /[^\w-]/.test(slug)) {
    toast('页面缩略名只能使用字母、数字、下划线和连字符');
    return;
  }

  const body = {
    cid: state.cid,
    title,
    text,
    slug,
    template: meta.template || '',
    status: meta.status === 'hidden' ? 'hidden' : 'publish',
    order: Number(meta.order || 0),
    allowComment: meta.allowComment !== false,
    fields: {},
  };

  const button = $('#btn-publish');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '保存中…';

  const previousKey = state.draftKey;

  try {
    const result = await call('pageSave', { method: 'POST', body });

    state.cid = result.cid;
    state.status = result.status;
    state.currentUrl = result.url || state.currentUrl;
    state.dirty = false;

    removeDraft(previousKey);
    // 页面草稿键用完即弃，历史快照同样要清理，避免残留占满本地存储
    if (previousKey) {
      clearHistory(previousKey);
    }
    state.draftKey = '';

    destroyEditor();
    clearTimeout(state.autosaveTimer);
    show('pages');
    await loadPages({ reset: true });

    toast(result.status === 'hidden' ? '已保存为隐藏页面' : '已保存');
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

/** 用系统浏览器 / 内置浏览器打开线上页面 */
async function openInBrowser(url) {
  if (!url) {
    toast('还没有可访问的链接');
    return;
  }

  try {
    await Browser.open({ url });
  } catch (error) {
    toast('打开浏览器失败');
  }
}

// ─── 友情链接 ────────────────────────────────────────────────────────────

const links = {
  items: [],
  sorts: {},
  loading: false,
  seq: 0,
  editing: null,
  armed: false,
};

/** 管理页入口打开友链列表 */
function openLinks() {
  if (!isConfigured()) {
    openSettings();
    return;
  }

  show('links');
  loadLinks();
}

async function loadLinks() {
  const seq = (links.seq += 1);
  links.loading = true;
  el.linksLoading.hidden = links.items.length > 0;
  el.linksLoading.textContent = '加载中…';

  try {
    const data = await call('links');

    if (seq !== links.seq) {
      return;
    }

    links.items = data.items || [];
    links.sorts = data.sorts || links.sorts;
    renderLinks();
  } catch (error) {
    if (seq !== links.seq) {
      return;
    }

    toast(error.message);

    if (!links.items.length) {
      el.linksLoading.hidden = false;
      el.linksLoading.textContent = error.message;
    }
  } finally {
    if (seq === links.seq) {
      links.loading = false;
    }
  }
}

function renderLinks() {
  el.linksItems.innerHTML = '';
  el.linksEmpty.hidden = links.items.length > 0;
  el.linksLoading.hidden = true;

  if (!links.items.length) {
    return;
  }

  const fragment = document.createDocumentFragment();

  links.items.forEach((item) => {
    fragment.appendChild(createLinkItem(item));
  });

  el.linksItems.appendChild(fragment);
}

function createLinkItem(item) {
  const row = document.createElement('div');
  row.className = 'link-item';

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'link-main';
  main.addEventListener('click', () => openLinkSheet(item));

  const avatar = document.createElement('span');
  avatar.className = 'link-avatar';
  const initial = (item.name || '?').trim().slice(0, 1).toUpperCase();

  if (item.image) {
    const img = document.createElement('img');
    img.src = item.image;
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      img.remove();
      avatar.textContent = initial;
    });
    avatar.appendChild(img);
  } else {
    avatar.textContent = initial;
  }

  const body = document.createElement('span');
  body.className = 'link-body';

  const name = document.createElement('span');
  name.className = 'link-name';
  name.textContent = item.name || '未命名链接';

  const url = document.createElement('span');
  url.className = 'link-url';
  url.textContent = item.url || '';

  const description = document.createElement('span');
  description.className = 'link-desc';
  description.textContent = item.description || '暂无描述';

  body.append(name, url, description);

  const sort = document.createElement('span');
  sort.className = `badge link-badge${linkSortClass(item.sort)}`;
  sort.textContent = item.sortName || '未分类';

  main.append(avatar, body, sort);
  row.appendChild(main);

  return row;
}

/** 用角标颜色区分输出位置 */
function linkSortClass(sort) {
  if (sort === 'ten') {
    return '';
  }

  if (sort === 'good') {
    return ' scheduled';
  }

  if (sort === 'others') {
    return ' draft';
  }

  return ' local';
}

function renderLinkSortOptions() {
  const sorts = Object.keys(links.sorts).length
    ? links.sorts
    : { ten: '全站链接', one: '内页链接', good: '推荐链接', others: '失效链接' };

  el.linkSort.innerHTML = '';

  Object.entries(sorts).forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    el.linkSort.appendChild(option);
  });
}

function openLinkSheet(item) {
  links.editing = item || null;
  links.armed = false;
  renderLinkSortOptions();

  el.linkSheetTitle.textContent = item ? '编辑友链' : '新增友链';
  el.linkName.value = item ? item.name : '';
  el.linkUrl.value = item ? item.url : '';
  el.linkSort.value = item && item.sort ? item.sort : 'ten';
  el.linkImage.value = item ? item.image : '';
  el.linkDescription.value = item ? item.description : '';
  el.linkOrder.value = item ? String(item.order || 0) : '';
  el.linkDelete.hidden = !item;
  el.linkDelete.disabled = false;
  el.linkDelete.textContent = '删除';
  el.linkDelete.classList.remove('armed');

  showSheet(el.linkSheet, el.linkMask);

  if (!item) {
    setTimeout(() => el.linkName.focus(), 120);
  }
}

function closeLinkSheet() {
  hideSheet(el.linkSheet, el.linkMask);
  links.editing = null;
  links.armed = false;
}

async function saveLink() {
  const name = el.linkName.value.trim();
  const url = el.linkUrl.value.trim();

  if (!name) {
    toast('请填写链接名称');
    return;
  }

  if (!url) {
    toast('请填写链接地址');
    return;
  }

  if (!/^https?:\/\//i.test(url)) {
    toast('链接地址需以 http:// 或 https:// 开头');
    return;
  }

  const image = el.linkImage.value.trim();

  if (image && !/^https?:\/\//i.test(image)) {
    toast('图片地址需以 http:// 或 https:// 开头');
    return;
  }

  const body = {
    lid: links.editing ? links.editing.lid : 0,
    name,
    url,
    sort: el.linkSort.value || 'ten',
    image,
    description: el.linkDescription.value.trim(),
    order: el.linkOrder.value === '' ? null : Number(el.linkOrder.value),
  };

  const button = $('#link-sheet-done');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '保存中…';

  try {
    await call('linkSave', { method: 'POST', body });
    closeLinkSheet();
    await loadLinks();
    toast('已保存');
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function deleteLink() {
  if (!links.editing) {
    return;
  }

  // 删除不可撤销，第一次点击只进入待确认态
  if (!links.armed) {
    links.armed = true;
    el.linkDelete.textContent = '再次点击确认删除';
    el.linkDelete.classList.add('armed');
    return;
  }

  el.linkDelete.disabled = true;

  try {
    await call('linkDelete', { method: 'POST', body: { lid: links.editing.lid } });
    closeLinkSheet();
    await loadLinks();
    toast('已删除');
  } catch (error) {
    el.linkDelete.disabled = false;
    toast(error.message);
  }
}

// ─── 数据看板 ────────────────────────────────────────────────────────────

const stats = {
  loading: false,
  seq: 0,
  data: null,
  // 看板趋势范围：7 / 14 / 30 天，与接口的 days 参数一致
  days: 14,
};

function openStats() {
  if (!isConfigured()) {
    openSettings();
    return;
  }

  show('stats');
  loadStats();
}

async function loadStats() {
  const seq = (stats.seq += 1);
  stats.loading = true;

  if (!stats.data) {
    el.statsLoading.hidden = false;
    el.statsLoading.textContent = '加载中…';
  }

  try {
    const data = await call('stats', { query: { days: stats.days } });

    if (seq !== stats.seq) {
      return;
    }

    stats.data = data;
    renderStats(data);
    el.statsLoading.hidden = true;
    el.statsContent.hidden = false;
  } catch (error) {
    if (seq !== stats.seq) {
      return;
    }

    toast(error.message);

    if (!stats.data) {
      el.statsLoading.hidden = false;
      el.statsLoading.textContent = error.message;
    }
  } finally {
    if (seq === stats.seq) {
      stats.loading = false;
    }
  }
}

function renderStats(data) {
  const totals = data.totals || {};
  const tiles = [
    { label: '已发布', value: Number(totals.posts || 0) },
    { label: '草稿', value: Number(totals.drafts || 0) },
    { label: '独立页面', value: Number(totals.pages || 0) },
    { label: '评论', value: Number(totals.comments || 0) },
    { label: '待审核', value: Number(totals.waiting || 0), warn: Number(totals.waiting || 0) > 0 },
    { label: '媒体', value: Number(totals.media || 0) },
  ];

  el.statsGrid.innerHTML = '';

  tiles.forEach((tile) => {
    const item = document.createElement('div');
    item.className = 'stat-tile';

    const value = document.createElement('strong');
    value.className = 'stat-value';
    value.textContent = String(tile.value);

    if (tile.warn) {
      value.classList.add('warn');
    }

    const label = document.createElement('span');
    label.className = 'stat-label';
    label.textContent = tile.label;

    item.append(value, label);
    el.statsGrid.appendChild(item);
  });

  const days = Number(data.days || stats.days);
  el.statsTrendTitle.textContent = `近 ${days} 天动态`;

  renderStatsVisits(data.visits);
  renderStatsChart(data.trend || []);
  renderStatsCategories(data.categories || []);
}

function renderStatsVisits(visits) {
  const metrics = el.statsVisitMetrics;
  metrics.innerHTML = '';
  el.statsVisitChart.innerHTML = '';
  el.statsVisitPages.innerHTML = '';
  el.statsVisitLegend.hidden = true;

  // 站点未安装 VisitorStats 或从未采集过数据
  if (!visits || !visits.available) {
    const empty = document.createElement('p');
    empty.className = 'stats-empty';
    empty.textContent = '暂无访问数据（需启用 VisitorStats 插件）';
    metrics.appendChild(empty);
    return;
  }

  [
    ['今日浏览', visits.today],
    ['累计浏览', visits.total],
    ['独立访客', visits.uv],
  ].forEach(([label, value]) => {
    const item = document.createElement('div');
    item.className = 'visit-metric';

    const number = document.createElement('strong');
    number.className = 'visit-value';
    number.textContent = String(Number(value || 0));

    const text = document.createElement('span');
    text.className = 'visit-label';
    text.textContent = label;

    item.append(number, text);
    metrics.appendChild(item);
  });

  el.statsVisitLegend.hidden = !renderStatsVisitChart(visits.trend || []);
  renderStatsVisitPages(visits.pages || []);
}

function renderStatsVisitChart(trend) {
  if (!trend.length || trend.every((day) => !day.pv && !day.uv)) {
    const empty = document.createElement('p');
    empty.className = 'stats-empty';
    empty.textContent = '近 14 天暂无访问记录';
    el.statsVisitChart.appendChild(empty);
    return false;
  }

  const max = Math.max(1, ...trend.map((day) => Math.max(day.pv || 0, day.uv || 0)));
  const step = chartLabelStep(trend.length);

  trend.forEach((day, index) => {
    const column = document.createElement('div');
    column.className = 'chart-day';

    const bars = document.createElement('div');
    bars.className = 'chart-bars';

    [
      ['pv', Number(day.pv || 0)],
      ['uv', Number(day.uv || 0)],
    ].forEach(([kind, value]) => {
      const bar = document.createElement('i');
      bar.className = `chart-bar ${kind}`;
      bar.style.height = `${Math.round((value / max) * 100)}%`;
      bar.title = `${day.date} · ${kind === 'pv' ? '浏览量' : '独立访客'} ${value}`;
      bars.appendChild(bar);
    });

    column.appendChild(bars);

    if (index % step === 0 || index === trend.length - 1) {
      const label = document.createElement('span');
      label.className = 'chart-label';
      label.textContent = day.label;
      column.appendChild(label);
    }

    el.statsVisitChart.appendChild(column);
  });

  return true;
}

function renderStatsVisitPages(pages) {
  if (!pages.length) {
    const empty = document.createElement('p');
    empty.className = 'stats-empty';
    empty.textContent = '暂无页面访问记录';
    el.statsVisitPages.appendChild(empty);
    return;
  }

  pages.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'page-row';

    const rank = document.createElement('span');
    rank.className = 'page-rank';
    rank.textContent = String(index + 1);

    const info = document.createElement('div');
    info.className = 'page-info';

    const name = document.createElement('span');
    name.className = 'page-name';
    name.textContent = item.title || item.path || '/';
    info.appendChild(name);

    // 有文章标题时把原始路径作为副标题，便于辨认
    if (item.title && item.path) {
      const path = document.createElement('span');
      path.className = 'page-path';
      path.textContent = item.path;
      info.appendChild(path);
    }

    const meta = document.createElement('div');
    meta.className = 'page-meta';

    const pv = document.createElement('strong');
    pv.className = 'page-pv';
    pv.textContent = String(Number(item.pv || 0));

    const uv = document.createElement('span');
    uv.className = 'page-uv';
    uv.textContent = `UV ${Number(item.uv || 0)}`;

    meta.append(pv, uv);
    row.append(rank, info, meta);
    el.statsVisitPages.appendChild(row);
  });
}

function renderStatsChart(trend) {
  el.statsChart.innerHTML = '';

  if (!trend.length) {
    const empty = document.createElement('p');
    empty.className = 'stats-empty';
    empty.textContent = '暂无趋势数据';
    el.statsChart.appendChild(empty);
    return;
  }

  // 站点近期没有更新时画一排空柱没有意义，直接给一句说明
  if (trend.every((day) => !day.posts && !day.comments)) {
    const empty = document.createElement('p');
    empty.className = 'stats-empty';
    empty.textContent = `近 ${stats.days} 天没有新的发布或评论`;
    el.statsChart.appendChild(empty);
    return;
  }

  const max = Math.max(1, ...trend.map((day) => Math.max(day.posts || 0, day.comments || 0)));
  const step = chartLabelStep(trend.length);

  trend.forEach((day, index) => {
    const column = document.createElement('div');
    column.className = 'chart-day';

    const bars = document.createElement('div');
    bars.className = 'chart-bars';

    [
      ['post', Number(day.posts || 0)],
      ['comment', Number(day.comments || 0)],
    ].forEach(([kind, value]) => {
      const bar = document.createElement('i');
      bar.className = `chart-bar ${kind}`;
      bar.style.height = `${Math.round((value / max) * 100)}%`;
      bar.title = `${day.date} · ${kind === 'post' ? '发布' : '评论'} ${value}`;
      bars.appendChild(bar);
    });

    column.appendChild(bars);

    // 日期标签太密会挤在一起，按范围疏密显示并保证最后一天有标签
    if (index % step === 0 || index === trend.length - 1) {
      const label = document.createElement('span');
      label.className = 'chart-label';
      label.textContent = day.label;
      column.appendChild(label);
    }

    el.statsChart.appendChild(column);
  });
}

/**
 * 图表日期标签的间隔
 *
 * 7 天全显示，14 天隔一天，30 天每 5 天，保证大约 6-7 个标签。
 */
function chartLabelStep(total) {
  if (total > 20) {
    return 5;
  }

  return total > 10 ? 2 : 1;
}

function renderStatsCategories(categories) {
  el.statsCategories.innerHTML = '';

  if (!categories.length) {
    const empty = document.createElement('p');
    empty.className = 'stats-empty';
    empty.textContent = '暂无分类数据';
    el.statsCategories.appendChild(empty);
    return;
  }

  const max = Math.max(1, ...categories.map((item) => Number(item.count || 0)));

  categories.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'cat-row';

    const head = document.createElement('div');
    head.className = 'cat-head';

    const name = document.createElement('span');
    name.className = 'cat-name';
    name.textContent = item.name || '未命名分类';

    const count = document.createElement('span');
    count.className = 'cat-count';
    count.textContent = String(item.count || 0);

    head.append(name, count);

    const track = document.createElement('div');
    track.className = 'cat-track';

    const fill = document.createElement('i');
    fill.className = 'cat-fill';
    fill.style.width = `${Math.round((Number(item.count || 0) / max) * 100)}%`;

    track.appendChild(fill);
    row.append(head, track);
    el.statsCategories.appendChild(row);
  });
}

// ─── 访客明细 ────────────────────────────────────────────────────────────

const VISITOR_PAGE_SIZE = 30;

const visitors = {
  seq: 0,
  range: 'today',
  page: 1,
  hasMore: true,
  loading: false,
  items: [],
  total: 0,
  uv: 0,
};

function openVisitors() {
  if (!isConfigured()) {
    openSettings();
    return;
  }

  show('visitors');
  loadVisitors(true);
}

/**
 * 拉取访客记录
 *
 * @param {boolean} reset 切换时间范围或刷新时从第一页重新拉
 */
async function loadVisitors(reset = false) {
  if (reset) {
    visitors.page = 1;
    visitors.hasMore = true;
    visitors.items = [];
  }

  if (!visitors.hasMore && !reset) {
    return;
  }

  const seq = (visitors.seq += 1);
  visitors.loading = true;
  updateVisitorsMore();

  if (reset) {
    el.visitorsLoading.hidden = false;
    el.visitorsLoading.textContent = '加载中…';
    el.visitorsEmpty.hidden = true;
    el.visitorsItems.innerHTML = '';
    el.visitorsSummary.textContent = '';
  }

  try {
    const data = await call('visitors', {
      query: { range: visitors.range, page: visitors.page },
    });

    if (seq !== visitors.seq) {
      return;
    }

    // 站点未安装 VisitorStats 或从未采集
    if (!data.available) {
      el.visitorsLoading.hidden = false;
      el.visitorsLoading.textContent = '暂无访问数据（需启用 VisitorStats 插件）';
      visitors.hasMore = false;
      updateVisitorsMore();
      return;
    }

    const items = data.items || [];
    visitors.items = reset ? items : [...visitors.items, ...items];
    visitors.hasMore = Boolean(data.hasMore);
    visitors.total = Number(data.total || 0);
    visitors.uv = Number(data.uv || 0);

    el.visitorsSummary.textContent = visitors.total
      ? `浏览量 ${visitors.total} · 独立访客 ${visitors.uv}`
      : '';

    renderVisitors();
    el.visitorsLoading.hidden = true;
    updateVisitorsMore();
  } catch (error) {
    if (seq !== visitors.seq) {
      return;
    }

    // 失败时回退页码：否则下次「加载更多」会跳过整页数据
    if (!reset) {
      visitors.page = Math.max(1, visitors.page - 1);
    }

    toast(error.message);

    if (reset) {
      el.visitorsLoading.hidden = false;
      el.visitorsLoading.textContent = error.message;
    }
  } finally {
    if (seq === visitors.seq) {
      visitors.loading = false;
    }
  }
}

function updateVisitorsMore() {
  el.visitorsMore.hidden = !visitors.hasMore || visitors.loading;
  el.visitorsMore.disabled = visitors.loading;
  el.visitorsMore.textContent = visitors.loading && visitors.items.length ? '加载中…' : '加载更多';
}

function renderVisitors() {
  el.visitorsItems.innerHTML = '';

  if (!visitors.items.length) {
    el.visitorsEmpty.hidden = false;
    return;
  }

  el.visitorsEmpty.hidden = true;

  const fragment = document.createDocumentFragment();

  visitors.items.forEach((item) => {
    fragment.appendChild(createVisitorItem(item));
  });

  el.visitorsItems.appendChild(fragment);
}

function createVisitorItem(item) {
  const wrap = document.createElement('div');
  wrap.className = 'visitor-item';

  const top = document.createElement('div');
  top.className = 'visitor-top';

  const title = document.createElement('strong');
  title.className = 'visitor-title';
  title.textContent = item.title || item.path || '/';

  const time = document.createElement('span');
  time.className = 'visitor-time';
  time.textContent = formatVisitorTime(item.time);

  top.append(title, time);
  wrap.appendChild(top);

  if (item.title && item.path) {
    const path = document.createElement('p');
    path.className = 'visitor-path';
    path.textContent = item.path;
    wrap.appendChild(path);
  }

  const meta = document.createElement('div');
  meta.className = 'visitor-meta';

  const place = document.createElement('span');
  place.textContent = visitorPlace(item);

  const ua = document.createElement('span');
  ua.textContent = describeUA(item.ua);

  const ip = document.createElement('span');
  ip.className = 'visitor-ip';
  ip.textContent = item.ip;

  meta.append(place, ua, ip);
  wrap.appendChild(meta);

  const referrer = referrerHost(item.referrer);

  if (referrer) {
    const from = document.createElement('p');
    from.className = 'visitor-referrer';
    from.textContent = `来源 ${referrer}`;
    wrap.appendChild(from);
  }

  return wrap;
}

/** "2026-11-25 06:12:34" → 今天只显示时间，其余带月日 */
function formatVisitorTime(value) {
  const text = String(value || '');
  const date = text.slice(0, 10);
  const clock = text.slice(11, 16);

  if (!date || !clock) {
    return text;
  }

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return date === today ? clock : `${date.slice(5)} ${clock}`;
}

function visitorPlace(item) {
  const country = String(item.country || '').trim();
  const region = String(item.region || '').trim();
  const city = String(item.city || '').trim();

  // VisitorStats 的 country 可能是「中国江苏省南京市电信」这类完整归属地，
  // 再拼 region / city 会重复，命中时直接展示原始值
  if (country && ((region && country.includes(region)) || (city && country.includes(city)))) {
    return country;
  }

  const parts = [country, region, city].filter(
    (part, index, list) => part && list.indexOf(part) === index
  );

  return parts.length ? parts.join(' · ') : '未知地区';
}

/**
 * User-Agent 归并成「设备 · 浏览器 · 系统」
 *
 * Chrome 的 UA 也含 Safari，微信 / Edge 也含 Chrome，因此顺序不能乱。
 */
function describeUA(value) {
  const text = String(value || '');

  if (!text) {
    return '未知设备';
  }

  const device = /iPad|Tablet/i.test(text)
    ? '平板'
    : /Mobile|Android|iPhone|iPod/i.test(text)
      ? '手机'
      : '电脑';

  const rules = [
    [/MicroMessenger/i, '微信'],
    [/QQBrowser/i, 'QQ 浏览器'],
    [/Edg\//i, 'Edge'],
    [/OPR\/|Opera/i, 'Opera'],
    [/Firefox\//i, 'Firefox'],
    [/Chrome\//i, 'Chrome'],
    [/Safari\//i, 'Safari'],
  ];

  let browser = '其他';

  for (const [pattern, name] of rules) {
    if (pattern.test(text)) {
      browser = name;
      break;
    }
  }

  let os = '';

  if (/Android/i.test(text)) {
    os = 'Android';
  } else if (/iPhone|iPad|iPod/i.test(text)) {
    os = 'iOS';
  } else if (/Windows/i.test(text)) {
    os = 'Windows';
  } else if (/Mac OS X/i.test(text)) {
    os = 'macOS';
  } else if (/Linux/i.test(text)) {
    os = 'Linux';
  }

  return [device, browser, os].filter(Boolean).join(' · ');
}

function referrerHost(value) {
  const text = String(value || '').trim();

  if (!text) {
    return '';
  }

  try {
    return new URL(text).host || text;
  } catch {
    return text;
  }
}

// ─── 抽屉通用 ────────────────────────────────────────────────────────────

// 抽屉关闭动画延时器：按面板分别存储。共用同一个定时器时，
// 打开另一个面板会清掉正在关闭的面板的延时，留下透明遮罩拦截点击
const sheetTimers = new WeakMap();

/** 所有会盖住页面的弹层，任意一个打开时锁住底层滚动 */
const OVERLAY_IDS = [
  'sheet',
  'page-sheet',
  'link-sheet',
  'shuoshuo-sheet',
  'album-sheet',
  'album-viewer',
  'history-sheet',
  'item-sheet',
  'theme-sheet',
  'table-sheet',
  'snippet-sheet',
  'media-sheet',
  'dialog',
];

/**
 * 根据弹层显隐同步 body.modal-open
 *
 * 编辑器里的面板由 editor.js 派发 sxlb:overlay 事件触发重算。
 */
function syncModalLock() {
  const open = OVERLAY_IDS.some((id) => {
    const node = document.getElementById(id);

    return node && !node.hidden;
  });

  document.body.classList.toggle('modal-open', open);
}

function showSheet(sheet, mask) {
  clearTimeout(sheetTimers.get(sheet));
  sheetTimers.delete(sheet);
  sheet.hidden = false;
  mask.hidden = false;
  // 面板里的按钮要能被辅助技术与键盘访问，hidden/aria-hidden 必须成对切换
  sheet.setAttribute('aria-hidden', 'false');
  syncModalLock();
  requestAnimationFrame(() => {
    sheet.classList.add('open');
    mask.classList.add('open');
  });
}

function hideSheet(sheet, mask) {
  sheet.classList.remove('open');
  mask.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  clearTimeout(sheetTimers.get(sheet));
  const timer = setTimeout(() => {
    sheet.hidden = true;
    mask.hidden = true;
    sheetTimers.delete(sheet);
    syncModalLock();
  }, 260);
  sheetTimers.set(sheet, timer);
}

// ─── 发布前检查 ──────────────────────────────────────────────────────────

let checkOpen = false;

function setCheckOpen(open) {
  el.check.panel.classList.toggle('open', open);
  el.check.list.hidden = !open;
  el.check.toggle.setAttribute('aria-expanded', String(open));
  checkOpen = open;
}

function flash(node) {
  if (!node) {
    return;
  }

  node.classList.remove('flash');
  void node.offsetWidth;
  node.classList.add('flash');
  setTimeout(() => node.classList.remove('flash'), 1200);
}

/**
 * 汇总发布前的检查项
 *
 * @param {{title: string, text: string, isDraft: boolean}} input
 * @returns {Array<{level: 'error'|'warn'|'ok', label: string, fix?: string}>}
 */
function collectCheck({ title, text, isDraft }) {
  const items = [];
  const words = countWords(text);
  const slug = el.slug.value.trim();

  if (!title) {
    // 草稿允许空标题（服务端会兜底「未命名文档」），正式发布必须填
    items.push(
      isDraft
        ? { level: 'warn', label: '标题为空，将保存为「未命名文档」', fix: 'title' }
        : { level: 'error', label: '标题还没填', fix: 'title' },
    );
  } else if (title.length > 40) {
    items.push({ level: 'warn', label: `标题 ${title.length} 字，超过 40 字在列表里容易折行`, fix: 'title' });
  }

  if (!text.trim()) {
    items.push({ level: 'error', label: '正文是空的', fix: 'editor' });
  } else if (words < 50) {
    items.push({ level: 'warn', label: `正文只有 ${words} 字，内容偏短`, fix: 'editor' });
  }

  if (!isDraft && state.selectedMids.size === 0) {
    items.push({ level: 'error', label: '还没有选择分类', fix: 'category' });
  }

  if (!el.summary.value.trim()) {
    items.push({ level: 'warn', label: '摘要为空，将由主题自动截取', fix: 'summary' });
  }

  if (!el.thumb.value.trim()) {
    items.push({ level: 'warn', label: '没有封面图，列表里会使用默认图', fix: 'thumb' });
  }

  if (!collectTags().length) {
    items.push({ level: 'warn', label: '没有标签，不利于归档和搜索', fix: 'tags' });
  }

  if (slug && /[^\w-]/.test(slug)) {
    items.push({ level: 'warn', label: '固定链接含空格或中文，建议只用字母、数字和连字符', fix: 'slug' });
  }

  if (!items.length) {
    items.push({ level: 'ok', label: '检查通过，可以发布' });
  }

  return items;
}

/**
 * 点「去填写」定位到对应字段
 *
 * @param {string} fix
 */
function focusFix(fix) {
  const map = {
    title: el.title,
    summary: el.summary,
    thumb: el.thumb,
    slug: el.slug,
    tags: el.tags,
    category: el.categoryChips,
  };
  const editor =
    document.querySelector('#editor .vditor-ir .vditor-reset') ||
    document.querySelector('#editor .vditor-wysiwyg .vditor-reset') ||
    document.querySelector('#editor .vditor-sv');
  const target = fix === 'editor' ? editor : map[fix];

  if (!target) {
    return;
  }

  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.focus?.({ preventScroll: true });
  flash(fix === 'category' ? el.categoryChips : target);
}

/**
 * 渲染检查面板
 *
 * @param {{isDraft?: boolean, expand?: boolean}} [options]
 */
function renderCheck({ isDraft = true, expand = false } = {}) {
  const items = collectCheck({ title: el.title.value.trim(), text: getEditorValue(), isDraft });
  const errors = items.filter((item) => item.level === 'error');
  const warnings = items.filter((item) => item.level === 'warn');

  state.checkDraft = isDraft;
  el.check.panel.hidden = false;
  el.check.panel.classList.toggle('has-error', errors.length > 0);
  el.check.panel.classList.toggle('has-warn', errors.length === 0 && warnings.length > 0);
  el.check.title.textContent = errors.length
    ? '发布检查：有必须处理的项'
    : warnings.length
      ? '发布检查：建议完善'
      : '发布检查通过';
  el.check.count.textContent = errors.length
    ? `${errors.length} 项必须处理`
    : warnings.length
      ? `${warnings.length} 项建议`
      : '';

  el.check.list.innerHTML = '';

  items.forEach((item) => {
    const li = document.createElement('li');
    li.className = `check-item ${item.level}`;

    const flag = document.createElement('span');
    flag.className = 'check-flag';
    flag.textContent = item.level === 'error' ? '✕' : item.level === 'warn' ? '!' : '✓';

    const label = document.createElement('span');
    label.textContent = item.label;

    li.append(flag, label);

    if (item.fix) {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'check-link';
      link.textContent = '去填写';
      link.addEventListener('click', () => focusFix(item.fix));
      li.appendChild(link);
    }

    el.check.list.appendChild(li);
  });

  if (expand) {
    setCheckOpen(true);
  }
}

/** 字段改动后重新检查，保持展开状态 */
function refreshCheck() {
  if (!el.sheet.hidden) {
    renderCheck({ isDraft: state.checkDraft, expand: checkOpen });
  }
}

/** 恢复发布按钮文案与二次确认状态 */
function resetPublishConfirm() {
  state.allowWarnings = false;
  $('#btn-submit').textContent = '发布';
}

// ─── 发布抽屉 ────────────────────────────────────────────────────────────

/** 发布面板当前步骤：1 基本信息 / 2 封面与摘要 / 3 高级 */
let sheetStep = 1;

/**
 * 切换发布面板步骤
 *
 * 按钮显隐与步骤条高亮都跟着走，翻页时内容区回到顶部。
 */
function setSheetStep(step, { silent = false } = {}) {
  const next = Math.min(3, Math.max(1, Math.round(Number(step) || 1)));
  sheetStep = next;

  document.querySelectorAll('.sheet-pane').forEach((pane) => {
    pane.hidden = Number(pane.dataset.pane) !== next;
  });

  document.querySelectorAll('.sheet-step').forEach((button) => {
    const value = Number(button.dataset.step);
    button.classList.toggle('active', value === next);
    button.classList.toggle('done', value < next);
  });

  $('#btn-step-prev').hidden = next === 1;
  $('#btn-draft').hidden = next !== 3;
  $('#btn-step-next').hidden = next === 3;
  $('#btn-submit').hidden = next !== 3;

  if (!silent) {
    const body = document.querySelector('.sheet-body');

    if (body) {
      body.scrollTop = 0;
    }
  }
}

function openSheet() {
  ensureMetas();

  // 先把正文首图填进缩略图，避免检查误报「没有封面」
  if (!el.thumb.value.trim()) {
    const cover = firstImageUrl(getEditorValue());

    if (cover) {
      el.thumb.value = cover;
    }
  }

  resetPublishConfirm();
  setSheetStep(1, { silent: true });
  // 面板同时提供「存草稿 / 发布」，预览按更严格的发布口径展示，
  // 避免清单显示通过、点发布却跳回第一步报错
  renderCheck({ isDraft: false, expand: false });
  showSheet(el.sheet, el.sheetMask);
}

function closeSheet() {
  hideSheet(el.sheet, el.sheetMask);
}

function firstImageUrl(text) {
  const markdown = String(text).match(/!\[[^\]]*\]\(([^)\s]+)/);

  if (markdown) {
    return markdown[1];
  }

  const html = String(text).match(/<img[^>]+src=["']([^"']+)["']/i);

  return html ? html[1] : '';
}

async function submit(isDraft) {
  const title = el.title.value.trim();
  const text = getEditorValue();

  // 没填缩略图时，自动取正文第一张图
  if (!el.thumb.value.trim()) {
    const cover = firstImageUrl(text);
    if (cover) {
      el.thumb.value = cover;
    }
  }

  const items = collectCheck({ title, text, isDraft });
  const errors = items.filter((item) => item.level === 'error');
  const warnings = items.filter((item) => item.level === 'warn');

  if (errors.length) {
    resetPublishConfirm();
    // 检查清单在第 1 步，直接跳回去让用户看到具体问题
    setSheetStep(1);
    renderCheck({ isDraft, expand: true });
    toast(errors[0].label);
    return;
  }

  // 只有建议项时，先展开清单并让发布按钮进入二次确认，避免每篇都被拦
  if (!isDraft && warnings.length && !state.allowWarnings) {
    state.allowWarnings = true;
    setSheetStep(1);
    $('#btn-submit').textContent = '仍要发布';
    renderCheck({ isDraft, expand: true });
    toast(`还有 ${warnings.length} 项建议，确认无误请再点一次`);
    return;
  }

  const body = {
    cid: state.cid,
    title,
    text,
    slug: el.slug.value.trim(),
    isDraft,
    mid: [...state.selectedMids],
    tags: collectTags().join(','),
    pinned: el.pinned.checked,
    fields: currentFields(),
  };

  if (el.created.value) {
    body.created = Math.floor(new Date(el.created.value).getTime() / 1000);
  }

  const button = isDraft ? $('#btn-draft') : $('#btn-submit');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '提交中…';

  const previousKey = state.draftKey;

  try {
    const result = await call('save', { method: 'POST', body });

    pushHistory(String(result.cid), { title, text });

    state.cid = result.cid;
    state.status = result.status;
    state.dirty = false;
    // 下次打开发布抽屉时重新拉取标签，刚新建的标签也能出现在列表里
    state.metasLoaded = false;

    removeDraft(previousKey);
    removeDraft(String(result.cid));

    // 手动发布成功，清掉同一篇的待发项，避免联网时重复发送
    removeQueueByDraftKey(previousKey);
    removeQueueByDraftKey(String(result.cid));
    renderQueueBar();

    // 新文章的草稿键（draft-xxx）发布后作废，它的历史版本也一并清掉，
    // 否则每次「新建 → 发布」都会在 localStorage 留下一份无用快照
    if (previousKey && previousKey !== String(result.cid)) {
      clearHistory(previousKey);
    }

    closeSheet();
    destroyEditor();
    // 提交成功后停掉待执行的自动保存，避免状态栏在离开编辑器后又被改写
    clearTimeout(state.autosaveTimer);
    state.draftKey = '';

    // 从相册 / 日历 / 预览页进入的编辑，保存后回来源视图并刷新，而不是跳回首页列表
    if (state.returnView) {
      const view = state.returnView;
      state.returnView = '';

      if (view === 'album') {
        show('album');
        await loadAlbum({ reset: true });
        $('#album-body').scrollTop = 0;
      } else if (view === 'detail') {
        // 回预览页：正文与评论都重新拉一遍，避免看到旧内容
        state.detailFrom = 'list';
        show('detail');
        await openPostDetail(state.cid);
      } else if (!calendar.month) {
        // 日历还没初始化过（首次从日历进编辑就发布），交给标准入口设置月份
        openCalendar();
      } else {
        show('calendar');
        await loadCalendar();
      }
    } else {
      show('list');
      await loadPosts();
    }

    if (isDraft) {
      toast('已保存为草稿');
    } else if (result.scheduled) {
      toast('已设置定时发布');
    } else {
      toast('已发布');
    }
  } catch (error) {
    // 断网 / 超时：内容进待发队列，联网后自动重试，不用用户守着再点一次
    if (error.network) {
      upsertQueue({
        draftKey: state.draftKey,
        body,
        isDraft,
        title,
      });
      renderQueueBar();
      closeSheet();
      toast('网络不可用，已加入待发队列，联网后自动重试');
      return;
    }

    toast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = original;
    resetPublishConfirm();
  }
}

// ─── 历史版本 ────────────────────────────────────────────────────────────

function openHistory() {
  const list = readHistory(state.draftKey);
  el.historyList.innerHTML = '';

  if (!list.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = '还没有历史版本，保存或离开编辑器时会自动记录';
    el.historyList.appendChild(empty);
  }

  list.forEach((version, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-item';

    const info = document.createElement('div');
    info.className = 'history-info';

    const time = document.createElement('div');
    time.className = 'history-time';
    time.textContent = `${formatDateTime(version.at)} · ${countWords(version.text)} 字`;

    const preview = document.createElement('div');
    preview.className = 'history-preview';
    preview.textContent = String(version.text || '')
      .replace(/[#>*`\-\n]+/g, ' ')
      .trim()
      .slice(0, 48);

    info.appendChild(time);
    info.appendChild(preview);
    button.appendChild(info);

    if (index === 0) {
      time.textContent += '（最近）';
    }

    button.addEventListener('click', () => {
      restoreVersion(version);
    });

    el.historyList.appendChild(button);
  });

  showSheet(el.historySheet, el.historyMask);
}

function countWords(text) {
  return String(text || '').replace(/\s/g, '').length;
}

function restoreVersion(version) {
  maybeSnapshot(true);

  // 原地覆盖，不重建编辑器，避免 Vditor 销毁/重建时的内部状态报错
  el.title.value = version.title || el.title.value;
  setEditorValue(version.text);

  state.dirty = true;
  persistLocal();
  hideSheet(el.historySheet, el.historyMask);
  toast('已恢复该版本，记得保存');
}

// ─── 设置与更新 ──────────────────────────────────────────────────────────

function openSettings() {
  // 记住入口：从「我的」进来的，返回时回「我的」
  state.settingsFrom = state.view === 'me' ? 'me' : 'list';

  const settings = getSettings();
  el.settings.server.value = settings.server;
  el.settings.token.value = settings.token || '';
  el.settings.secret.value = settings.secret || '';
  el.settings.mode.value = settings.editorMode || DEFAULT_SETTINGS.editorMode;
  el.settings.size.value = settings.editorFontSize || DEFAULT_SETTINGS.editorFontSize;
  el.settings.postOpen.value = settings.postOpenMode || DEFAULT_SETTINGS.postOpenMode;
  el.settings.theme.value = settings.theme || DEFAULT_SETTINGS.theme;
  el.settings.adminMode.value = settings.adminMode || DEFAULT_SETTINGS.adminMode;
  el.settings.meLayout.value = settings.meLayout || DEFAULT_SETTINGS.meLayout;

  styleSelection = settings.style || DEFAULT_SETTINGS.style;
  customPreview = null;

  const custom = { ...DEFAULT_SETTINGS.customTheme, ...(settings.customTheme || {}) };
  el.settings.accent.value = custom.accent;
  el.settings.bg.value = custom.bg;
  el.settings.surface.value = custom.surface;
  el.settings.radius.value = String(custom.radius);
  el.settings.radiusValue.textContent = String(custom.radius);

  syncStylePicker();
  el.settings.custom.hidden = styleSelection !== 'custom';
  applyStyle(styleSelection);

  syncSettingsHero();
  renderVersion();
  // 自动检查可能在进入设置页之前就发现了新版本，这里同步一次面板状态
  renderUpdatePanel();
  show('settings');
}

/**
 * 顶部连接摘要
 *
 * 跟随表单实时变化，而不是只读已保存的设置：
 * 用户边填边能看到「还差什么」，不用先保存再回来看。
 */
function syncSettingsHero() {
  const server = el.settings.server.value.trim();
  const ready = Boolean(server && el.settings.token.value.trim() && el.settings.secret.value.trim());

  let host = '';

  try {
    host = server ? new URL(server).host : '';
  } catch {
    // 还没填完整时 new URL 会抛错，退回字符串粗提取
    host = server.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  }

  el.settings.heroDot.classList.toggle('ready', ready);
  el.settings.heroTitle.textContent = ready ? host || '配置已填写' : '尚未配置';
  el.settings.heroSub.textContent = ready
    ? '配置完整，可以开始写作'
    : '填好服务器地址、Token 与 Secret 后即可写作';
}

function syncStylePicker() {
  el.settings.style.querySelectorAll('[data-style]').forEach((button) => {
    button.classList.toggle('active', button.dataset.style === styleSelection);
  });
}

function readCustomForm() {
  return {
    accent: el.settings.accent.value,
    bg: el.settings.bg.value,
    surface: el.settings.surface.value,
    radius: Number(el.settings.radius.value) || DEFAULT_SETTINGS.customTheme.radius,
  };
}

function renderVersion() {
  const latest = state.update?.version;
  el.appVersion.textContent = latest
    ? `当前 v${APP_VERSION}，最新 v${latest}`
    : `当前版本 v${APP_VERSION}`;

  if (el.settings.heroVersion) {
    el.settings.heroVersion.textContent = `v${APP_VERSION}`;
  }
}

async function testConnection() {
  const result = saveSettingsFromForm();

  if (!result.ok) {
    toast(result.message);
    return;
  }

  if (!isConfigured()) {
    toast('请先填写完整信息');
    return;
  }

  try {
    const data = await call('ping');
    // 测试连接需要请求带上配置，所以这里会顺手保存；在提示里说清楚
    toast(`连接成功：${data.site}，配置已保存`);
  } catch (error) {
    toast(error.message);
  }
}

/**
 * 从表单读取并保存设置
 *
 * 地址留空表示主动断开：不再回落到默认站点，避免把 Token / 签名
 * 发往用户没有指定的域名。
 *
 * @returns {{ok: boolean, message?: string}}
 */
function saveSettingsFromForm() {
  const server = el.settings.server.value.trim();

  if (server && !/^https?:\/\/\S+$/i.test(server)) {
    return { ok: false, message: '服务器地址需以 http:// 或 https:// 开头' };
  }

  const saved = saveSettings({
    server,
    token: el.settings.token.value.trim(),
    secret: el.settings.secret.value.trim(),
    editorMode: el.settings.mode.value || DEFAULT_SETTINGS.editorMode,
    editorFontSize: el.settings.size.value || DEFAULT_SETTINGS.editorFontSize,
    postOpenMode: el.settings.postOpen.value || DEFAULT_SETTINGS.postOpenMode,
    theme: el.settings.theme.value || DEFAULT_SETTINGS.theme,
    style: styleSelection,
    customTheme: readCustomForm(),
    adminMode: el.settings.adminMode.value || DEFAULT_SETTINGS.adminMode,
    meLayout: el.settings.meLayout.value || DEFAULT_SETTINGS.meLayout,
  });

  if (!saved) {
    return { ok: false, message: '设置未能保存：本地存储空间不足，请清理草稿历史' };
  }

  applyStyle();
  applyTheme();
  applyFontSize();
  applyAdminEntry();
  applyMeLayout();

  return { ok: true };
}

/**
 * 回滚设置页的即时预览
 *
 * 主题 / 字号 / 风格在设置页里点了就立即生效，但那只是预览。
 * 现在只有点「保存设置」才写入，离开时要把这些预览恢复成已保存的样子，
 * 否则回到列表会看到一套其实没被保存的样式。
 */
function revertSettingsPreview() {
  const settings = getSettings();

  styleSelection = settings.style || DEFAULT_SETTINGS.style;
  customPreview = null;

  el.settings.theme.value = settings.theme || DEFAULT_SETTINGS.theme;
  el.settings.size.value = settings.editorFontSize || DEFAULT_SETTINGS.editorFontSize;
  el.settings.postOpen.value = settings.postOpenMode || DEFAULT_SETTINGS.postOpenMode;
  el.settings.adminMode.value = settings.adminMode || DEFAULT_SETTINGS.adminMode;
  el.settings.meLayout.value = settings.meLayout || DEFAULT_SETTINGS.meLayout;

  applyStyle(styleSelection);
  applyTheme(settings.theme);
  applyFontSize(settings.editorFontSize);
  applyAdminEntry();
  applyMeLayout();
}

/**
 * 离开设置页：不写入任何改动，仅在已保存配置不完整时拦截
 *
 * 「返回」不再隐式保存——只有点「保存设置」才落盘，
 * 避免用户只是看了眼设置、退回列表，配置就被悄悄改了。
 *
 * @param {{allowExit?: boolean}} [options] allowExit 为真且表单全空时允许退出 App
 */
function leaveSettings({ allowExit = false } = {}) {
  const settings = getSettings();

  if (!isConfigured(settings)) {
    const server = el.settings.server.value.trim();
    const token = el.settings.token.value.trim();
    const secret = el.settings.secret.value.trim();
    const blank = !server && !token && !secret;

    if (allowExit && blank) {
      App.exitApp();
      return;
    }

    // 已经填了但没存：引导去点保存；完全没填：说明缺哪几项
    toast(blank ? '请先填写服务器地址、Token 与 Secret' : '配置尚未保存，请点下方「保存设置」');
    show('settings');
    return;
  }

  revertSettingsPreview();

  if (state.settingsFrom === 'me') {
    openMe();
    return;
  }

  show('list');
  loadPosts();
}

function compareVersion(a, b) {
  const left = String(a).split('.').map((part) => Number(part) || 0);
  const right = String(b).split('.').map((part) => Number(part) || 0);

  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const x = left[i] || 0;
    const y = right[i] || 0;

    if (x !== y) {
      return x > y ? 1 : -1;
    }
  }

  return 0;
}

// 更新检查进行中标记：避免连点重复请求、重复下载
let updateChecking = false;
// 下载 / 安装阶段：idle 未开始、downloading 下载中、saved 已就绪、failed 失败
let updateStage = 'idle';
let updateError = '';
let updateSource = '';
let savedApkUri = '';
// 浏览器环境下没有文件 URI 语义，安装时用内存里的 base64 还原
let savedApkBase64 = '';

/**
 * 检查更新
 *
 * @param {{manual?: boolean}} [options] manual 为真时：无更新给提示，有更新自动开始下载
 */
async function checkUpdate({ manual = false } = {}) {
  if (updateChecking) {
    return;
  }

  updateChecking = true;

  try {
    const latest = await fetchLatestRelease();

    state.update = latest;
    renderVersion();

    if (compareVersion(latest.version, APP_VERSION) <= 0) {
      updateStage = 'idle';
      renderUpdatePanel();

      if (manual) {
        toast('当前已是最新版本');
      }

      return;
    }

    // 版本号变了说明缓存的旧包已过期，直接丢弃重新下
    savedApkUri = '';
    savedApkBase64 = '';

    if (manual) {
      // 手动点「检查更新」= 想升级，直接开始下载
      startUpdate();
    } else {
      updateStage = 'idle';
      renderUpdatePanel();
      toast(`发现新版本 v${latest.version}，可在设置中更新`);
    }

    // 只有检查成功才记录时间：失败时下次打开还会重试
    try {
      localStorage.setItem('sxlb.updateCheck', String(Date.now()));
    } catch {
      // 存储已满时忽略，不影响更新检查
    }
  } catch {
    if (manual) {
      toast('检查更新失败，请检查网络后重试');
    }
  } finally {
    updateChecking = false;
  }
}

/**
 * 渲染更新面板
 *
 * 五种状态共用一块区域：未发现新版本时整块隐藏。
 */
function renderUpdatePanel() {
  const panel = el.update.panel;

  if (!panel) {
    return;
  }

  const info = state.update || {};
  const hasUpdate = info.version && compareVersion(info.version, APP_VERSION) > 0;

  // 没有新版本（或正在下载旧版本）时整块隐藏
  panel.hidden = !hasUpdate;

  if (!hasUpdate) {
    return;
  }

  el.update.badge.textContent = `v${info.version}`;
  el.update.panel.dataset.stage = updateStage;

  const size = info.size ? ` · ${(info.size / 1024 / 1024).toFixed(1)} MB` : '';
  const texts = {
    idle: ['发现新版本', `下载完成后会自动打开安装界面${size}`],
    downloading: ['正在下载', `正在从 ${updateSource || 'GitHub'} 下载${size}，请保持网络畅通`],
    saved: ['已下载', '点「打开安装器」继续；若系统提示授权，请允许安装未知应用'],
    failed: ['更新未完成', updateError || '下载失败，可换用浏览器下载'],
  };
  const [title, desc] = texts[updateStage] || texts.idle;

  el.update.title.textContent = title;
  el.update.desc.textContent = desc;

  el.update.bar.hidden = updateStage !== 'downloading';
  el.update.install.hidden = updateStage === 'downloading';
  el.update.install.disabled = updateStage === 'downloading';

  // 已经落盘时按钮变成「打开安装器」，否则是重新下载
  const readyToInstall = savedApkUri && (updateStage === 'saved' || updateStage === 'failed');
  el.update.install.textContent = readyToInstall
    ? '打开安装器'
    : updateStage === 'failed'
      ? '重试'
      : '下载并安装';
  el.update.browser.hidden = updateStage === 'downloading';
}

/**
 * 下载并安装
 *
 * 下载成功先落盘再拉起安装器：用户切后台或 WebView 被回收后，
 * 回到前台还能直接装，不用重新下一遍。
 */
async function startUpdate() {
  const info = state.update;

  if (!info?.version || updateStage === 'downloading') {
    return;
  }

  updateStage = 'downloading';
  updateSource = '';
  updateError = '';
  renderUpdatePanel();

  try {
    const { base64, source } = await downloadApk(info.apkUrl, {
      expectedSize: info.size,
      onSource: (name) => {
        updateSource = name;
        renderUpdatePanel();
      },
    });

    savedApkBase64 = base64;
    savedApkUri = await saveApk(base64, info.version);
    updateStage = 'saved';
    renderUpdatePanel();

    await launchInstaller();
  } catch (error) {
    updateStage = 'failed';
    updateError = describeUpdateError(error);
    renderUpdatePanel();
    toast(updateError);
  }
}

/**
 * 拉起系统安装界面
 *
 * 从后台返回时 Android 会拦截应用启动 Activity，因此失败不算致命：
 * 文件已在缓存里，用户点「安装」按钮即可重试。
 */
async function launchInstaller() {
  if (!savedApkUri) {
    return;
  }

  try {
    await openApk(savedApkUri, savedApkBase64);
  } catch (error) {
    updateStage = 'failed';
    updateError = `无法自动打开安装界面，请点下方「安装」重试（${error.message || '未知原因'}）`;
    renderUpdatePanel();
  }
}

/**
 * 用户点「安装」：文件还在就直接装，被系统清掉就重新下载
 */
async function installSavedApk() {
  const version = state.update?.version || '';

  if (!savedApkUri) {
    savedApkUri = await findSavedApk(version);
  }

  if (!savedApkUri) {
    // 缓存被清理：重新走一遍下载
    startUpdate();
    return;
  }

  updateStage = 'saved';
  renderUpdatePanel();
  await launchInstaller();
}

/** 把底层错误翻译成用户能看懂的说明 */
function describeUpdateError(error) {
  const message = String(error?.message || '');

  if (/timeout|timed out|abort/i.test(message)) {
    return '下载超时，请检查网络后重试';
  }

  if (/HTTP 4\d\d/.test(message)) {
    return `下载被拒绝（${message}），请稍后重试`;
  }

  // 镜像返回错误页 / 被截断时都会走到这里，换源已自动试过
  if (/不是安装包|不完整/.test(message)) {
    return '安装包校验未通过，已自动换源重试仍失败，可改用浏览器下载';
  }

  // 写盘失败通常是缓存空间不足，磁盘满了会直接抛 IO 异常
  if (/写入失败|ENOSPC|No space|IO/i.test(message)) {
    return '安装包保存失败，请清理手机存储空间后重试';
  }

  return '下载失败，可换用浏览器下载';
}


/**
 * 列表下拉刷新
 *
 * 只有滚到顶部、接近垂直下拉且没有弹层打开时才触发，避免误触。
 */
function bindPullRefresh(node, action) {
  if (!node) {
    return;
  }

  let pullStart = null;

  node.addEventListener('touchstart', (event) => {
    // 多指缩放 / 双指手势不参与刷新判定
    pullStart = event.touches.length > 1
      ? null
      : { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });

  node.addEventListener('touchmove', (event) => {
    if (event.touches.length > 1) {
      pullStart = null;
    }
  }, { passive: true });

  node.addEventListener('touchend', (event) => {
    const start = pullStart;
    pullStart = null;

    if (!start || event.touches.length || document.body.classList.contains('modal-open')) {
      return;
    }

    const touch = event.changedTouches[0];
    const deltaY = touch.clientY - start.y;
    const deltaX = Math.abs(touch.clientX - start.x);

    // 只有接近垂直的下拉才触发，横向滑动（切换/滚动）和斜滑一律忽略
    if (deltaY > 90 && deltaY > deltaX * 1.5 && node.scrollTop === 0) {
      action();
    }
  }, { passive: true });
}

// ─── 事件绑定 ────────────────────────────────────────────────────────────

function bind() {
  $('#btn-refresh').addEventListener('click', () => loadPosts());
  el.selectBtn.addEventListener('click', () => setSelectMode(!state.selecting));
  el.batchAll.addEventListener('click', () => {
    const items = visibleServerItems();
    const allSelected =
      items.length > 0 && items.every((item) => state.selectedCids.has(item.cid));

    items.forEach((item) => {
      if (allSelected) {
        state.selectedCids.delete(item.cid);
      } else {
        state.selectedCids.add(item.cid);
      }
    });

    resetBatchConfirm();
    renderList();
    updateBatchBar();
  });
  el.batchPublish.addEventListener('click', () => runBatch('publish'));
  el.batchDraft.addEventListener('click', () => {
    // 转草稿会让文章从站点消失，加一次二次确认避免误触
    if (!batchArmed) {
      batchArmed = true;
      el.batchDraft.textContent = '确认转草稿？';
      el.batchDraft.classList.add('armed');
      batchTimer = setTimeout(resetBatchConfirm, 3000);
      return;
    }

    resetBatchConfirm();
    runBatch('draft');
  });
  // 底部导航：写作 / 时光机 / 相册 / 我的
  el.tabbar?.addEventListener('click', (event) => {
    const tab = event.target.closest('.tab');

    if (tab) {
      switchTab(tab.dataset.view);
    }
  });

  // 「我的」页管理宫格：站点设置与插件分开，各自直达
  el.meTools?.addEventListener('click', (event) => {
    const tile = event.target.closest('[data-me]');

    if (!tile) {
      return;
    }

    const key = tile.dataset.me;

    // 记下来源：这些页面的返回按钮据此决定回「我的」还是管理页
    adminFrom = 'me';

    if (key === 'pages') {
      openPages('me');
      return;
    }

    if (key === 'links') {
      openLinks();
      return;
    }

    if (key === 'calendar') {
      openCalendar();
      return;
    }

    if (key === 'site' || key === 'plugins') {
      show('admin');
      openAdmin(key);
    }
  });

  // 概览数字即入口：点已发布 / 草稿回列表，点评论 / 媒体 / 分类 / 标签进管理工具
  el.meStats?.addEventListener('click', (event) => {
    const node = event.target.closest('[data-stat]');

    if (node) {
      openStatTarget(node.dataset.stat);
    }
  });

  el.meDashboard?.addEventListener('click', () => {
    adminFrom = 'me';
    openStats();
  });

  el.meCheckUpdate?.addEventListener('click', () => checkUpdate({ manual: true }));

  $('#me-settings').addEventListener('click', openSettings);
  $('#btn-shuoshuo-refresh').addEventListener('click', () => loadShuoshuo({ reset: true }));
  $('#btn-shuoshuo-new').addEventListener('click', () => openShuoshuoSheet());
  $('#shuoshuo-sheet-close').addEventListener('click', closeShuoshuoSheet);
  $('#shuoshuo-cancel').addEventListener('click', closeShuoshuoSheet);
  el.shuoshuoMask.addEventListener('click', closeShuoshuoSheet);
  $('#btn-shuoshuo-image').addEventListener('click', pickShuoshuoImages);
  $('#btn-shuoshuo-submit').addEventListener('click', submitShuoshuo);
  el.shuoshuoMore.addEventListener('click', () => {
    shuoshuo.page += 1;
    loadShuoshuo({ reset: false });
  });
  $('#btn-album-refresh').addEventListener('click', () => loadAlbum({ reset: true }));
  $('#btn-album-new').addEventListener('click', openAlbumSheet);
  $('#album-sheet-close').addEventListener('click', closeAlbumSheet);
  $('#album-cancel').addEventListener('click', closeAlbumSheet);
  el.albumSheetMask.addEventListener('click', closeAlbumSheet);
  $('#btn-album-pick').addEventListener('click', pickAlbumImages);
  $('#btn-album-submit').addEventListener('click', () => submitAlbum(false));
  $('#btn-album-draft').addEventListener('click', () => submitAlbum(true));
  el.albumMore.addEventListener('click', () => {
    album.page += 1;
    loadAlbum({ reset: false });
  });
  el.albumViewerTrack.addEventListener('scroll', () => {
    const width = el.albumViewerTrack.clientWidth || 1;
    const index = Math.round(el.albumViewerTrack.scrollLeft / width);

    if (index !== album.viewerIndex) {
      album.viewerIndex = index;
      updateAlbumViewerCount();
    }
  }, { passive: true });
  $('#album-viewer-close').addEventListener('click', closeAlbumViewer);
  $('#album-viewer-edit').addEventListener('click', editAlbumPost);
  $('#album-viewer-delete').addEventListener('click', deleteAlbumPost);
  $('#album-viewer-open').addEventListener('click', () => {
    const url = album.viewing?.url;

    if (url) {
      openInBrowser(url);
    } else {
      toast('没有可打开的地址');
    }
  });
  $('#btn-admin-back').addEventListener('click', () => show('me'));
  $('#btn-pages-back').addEventListener('click', closePages);  $('#btn-pages-refresh').addEventListener('click', () => loadPages({ reset: true }));
  $('#btn-pages-new').addEventListener('click', openNewPage);
  el.pagesMore.addEventListener('click', () => {
    pages.page += 1;
    loadPages({ reset: false });
  });
  $('#page-sheet-close').addEventListener('click', closePageSheet);
  $('#page-sheet-cancel').addEventListener('click', closePageSheet);
  el.pageMask.addEventListener('click', closePageSheet);
  $('#page-sheet-done').addEventListener('click', applyPageSheet);
  $('#btn-links-back').addEventListener('click', backFromAdminChild);
  $('#btn-links-refresh').addEventListener('click', loadLinks);
  $('#btn-links-new').addEventListener('click', () => openLinkSheet(null));
  el.linkMask.addEventListener('click', closeLinkSheet);
  $('#link-sheet-close').addEventListener('click', closeLinkSheet);
  $('#link-sheet-cancel').addEventListener('click', closeLinkSheet);
  $('#link-sheet-done').addEventListener('click', saveLink);
  el.linkDelete.addEventListener('click', deleteLink);
  $('#btn-stats-back').addEventListener('click', backFromAdminChild);
  $('#btn-stats-refresh').addEventListener('click', loadStats);
  el.statsRange.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-days]');

    if (!button) {
      return;
    }

    const days = Number(button.dataset.days);

    if (!days || days === stats.days) {
      return;
    }

    stats.days = days;
    el.statsRange.querySelectorAll('button').forEach((item) => {
      item.classList.toggle('active', item === button);
    });
    loadStats();
  });
  $('#btn-visitors').addEventListener('click', openVisitors);
  $('#btn-calendar-back').addEventListener('click', backFromAdminChild);
  $('#btn-calendar-refresh').addEventListener('click', loadCalendar);
  $('#calendar-prev').addEventListener('click', () => shiftCalendarMonth(-1));
  $('#calendar-next').addEventListener('click', () => shiftCalendarMonth(1));
  $('#btn-visitors-back').addEventListener('click', () => show('stats'));
  $('#btn-visitors-refresh').addEventListener('click', () => loadVisitors(true));
  el.visitorsRange.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-range]');

    if (!button || button.dataset.range === visitors.range) {
      return;
    }

    visitors.range = button.dataset.range;
    el.visitorsRange.querySelectorAll('button').forEach((item) => {
      item.classList.toggle('active', item === button);
    });
    loadVisitors(true);
  });
  el.visitorsMore.addEventListener('click', () => {
    visitors.page += 1;
    loadVisitors();
  });
  $('#btn-preview').addEventListener('click', () => openInBrowser(state.currentUrl));
  $('#btn-new').addEventListener('click', openNew);
  $('#btn-back').addEventListener('click', backToList);
  $('#btn-save').addEventListener('click', () => {
    if (state.kind === 'page') {
      openPageSheet();
    } else {
      submit(state.status === 'draft');
    }
  });
  $('#btn-publish').addEventListener('click', () => {
    if (state.kind === 'page') {
      submitPage();
    } else {
      openSheet();
    }
  });
  $('#btn-settings-back').addEventListener('click', () => {
    leaveSettings();
  });

  $('#btn-history').addEventListener('click', openHistory);
  $('#history-close').addEventListener('click', () => hideSheet(el.historySheet, el.historyMask));
  el.historyMask.addEventListener('click', () => hideSheet(el.historySheet, el.historyMask));
  $('#item-close').addEventListener('click', closeItemSheet);
  el.itemMask.addEventListener('click', closeItemSheet);

  el.listSearch.addEventListener('input', () => {
    state.query = el.listSearch.value;
    resetBatchSelection();
    renderList();

    // 防抖后按标题从服务端重新检索，搜索结果不再受已加载页数限制
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      if (isConfigured()) {
        loadPosts({ reset: true });
      }
    }, 300);
  });

  el.listMore.addEventListener('click', () => {
    state.page += 1;
    loadPosts({ reset: false });
  });

  el.listFilters.addEventListener('click', (event) => {
    const button = event.target.closest('.chip');

    if (!button) {
      return;
    }

    state.filter = button.dataset.filter;
    resetBatchSelection();
    [...el.listFilters.children].forEach((chip) => {
      chip.classList.toggle('active', chip === button);
    });
    renderList();

    // 分页数据是按上一个筛选条件拉取的，切换后必须重新请求，避免「全部」只剩残缺列表
    if (isConfigured()) {
      loadPosts({ reset: true });
    }
  });

  // 空态里的「清除筛选」：一次性恢复全部筛选条件
  el.clearFilters?.addEventListener('click', () => {
    state.filter = 'all';
    state.query = '';
    state.category = 0;
    el.listSearch.value = '';

    if (el.listCategory) {
      el.listCategory.value = '';
    }

    [...el.listFilters.children].forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.filter === 'all');
    });
    resetBatchSelection();
    renderList();

    if (isConfigured()) {
      loadPosts({ reset: true });
    }
  });

  // 分类筛选：切换后重新从服务端拉第一页
  el.listCategory?.addEventListener('change', () => {
    state.category = Number(el.listCategory.value) || 0;
    resetBatchSelection();

    if (isConfigured()) {
      loadPosts({ reset: true });
    } else {
      renderList();
    }
  });

  // 编辑器里的弹层由 editor.js 派发事件，统一重算滚动锁
  window.addEventListener('sxlb:overlay', syncModalLock);

  el.title.addEventListener('input', () => {
    markDirty();
  });

  // 摘要 / 封面 / 缩略名 / 相册描述 / 定时时间：改动后同样进入本地自动保存
  [el.summary, el.thumb, el.slug, el.albumText, el.created, el.pinned].forEach((input) => {
    input.addEventListener('input', markDirty);
  });

  // 输入标签后回车 / 逗号，直接落成可点的标签
  el.tags.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ',' && event.key !== '，') {
      return;
    }

    event.preventDefault();

    const names = el.tags.value
      .split(/[,，]/)
      .map((name) => name.trim())
      .filter(Boolean);

    if (!names.length) {
      return;
    }

    names.forEach((name) => state.selectedTagNames.add(name));
    el.tags.value = '';
    renderTagChips();
    markDirty();
  });

  $('#btn-test').addEventListener('click', testConnection);
  $('#btn-save-settings').addEventListener('click', () => {
    const result = saveSettingsFromForm();

    if (!result.ok) {
      toast(result.message);
      return;
    }

    if (!isConfigured()) {
      toast('请先填写服务器地址、Token 与 Secret');
      return;
    }

    // 保存后留在设置页；列表在「返回」时统一加载，
    // 避免列表请求失败的网络提示覆盖「设置已保存」
    // 预览对象已经落盘，清掉后 currentCustomTheme() 直接读已保存值
    customPreview = null;
    toast('设置已保存');
  });
  $('#btn-check-update').addEventListener('click', () => checkUpdate({ manual: true }));

  // 更新面板：下载并安装 / 换浏览器下载 / 已下载后重新唤起安装器
  el.update.install?.addEventListener('click', () => {
    const ready = savedApkUri && (updateStage === 'saved' || updateStage === 'failed');

    if (ready) {
      installSavedApk();
      return;
    }

    startUpdate();
  });

  el.update.browser?.addEventListener('click', async () => {
    const url = state.update?.apkUrl || DOWNLOAD_URL;
    await openInBrowser(url);
  });

  // 外观切换即时预览，但目前只是预览：不点「保存设置」离开会回滚
  el.settings.theme.addEventListener('change', () => applyTheme(el.settings.theme.value));
  el.settings.size.addEventListener('change', () => applyFontSize(el.settings.size.value));

  // 界面风格：点一下立即换肤，同样需要点「保存设置」才生效到下次启动
  el.settings.style.addEventListener('click', (event) => {
    const button = event.target.closest('[data-style]');

    if (!button) {
      return;
    }

    styleSelection = button.dataset.style;

    if (styleSelection === 'custom' && !customPreview) {
      customPreview = readCustomForm();
    }

    syncStylePicker();
    el.settings.custom.hidden = styleSelection !== 'custom';
    applyStyle(styleSelection);
  });

  el.settings.custom.addEventListener('input', () => {
    if (styleSelection !== 'custom') {
      return;
    }

    customPreview = readCustomForm();
    el.settings.radiusValue.textContent = String(customPreview.radius);
    applyCustomTheme(customPreview);
  });

  // 连接摘要跟随输入实时变化
  [el.settings.server, el.settings.token, el.settings.secret].forEach((input) => {
    input.addEventListener('input', syncSettingsHero);
  });

  // 密钥默认打码，点「显示」临时查看
  document.querySelectorAll('.field-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.target);

      if (!input) {
        return;
      }

      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      button.textContent = reveal ? '隐藏' : '显示';
      button.setAttribute('aria-label', `${reveal ? '隐藏' : '显示'} ${button.dataset.target === 'set-token' ? 'Token' : 'Secret'}`);
    });
  });

  // 发布检查清单：展开/收起，字段改动后自动重算
  el.check.toggle.addEventListener('click', () => setCheckOpen(!checkOpen));
  el.sheet.addEventListener('input', () => {
    resetPublishConfirm();
    refreshCheck();
  });
  el.sheet.addEventListener('click', (event) => {
    if (event.target.closest('#btn-submit') || event.target.closest('#btn-draft')) {
      return;
    }
    resetPublishConfirm();
  });

  $('#sheet-close').addEventListener('click', closeSheet);
  el.sheetMask.addEventListener('click', closeSheet);
  $('#btn-step-next').addEventListener('click', () => setSheetStep(sheetStep + 1));
  $('#btn-step-prev').addEventListener('click', () => setSheetStep(sheetStep - 1));
  $('#sheet-steps').addEventListener('click', (event) => {
    const button = event.target.closest('.sheet-step');

    if (button) {
      setSheetStep(Number(button.dataset.step));
    }
  });
  $('#btn-draft').addEventListener('click', () => submit(true));
  $('#btn-submit').addEventListener('click', () => submit(false));

  $('#btn-thumb-upload').addEventListener('click', () => {
    const input = document.createElement('input');
    const button = $('#btn-thumb-upload');
    input.type = 'file';
    input.accept = 'image/*';

    input.addEventListener('change', async () => {
      if (!input.files?.length) {
        return;
      }

      button.disabled = true;
      button.textContent = '上传中…';

      try {
        const result = await uploadImage(input.files[0], state.cid);
        el.thumb.value = result.url;
        markDirty();
        toast('缩略图已上传');
      } catch (error) {
        toast(error.message);
      } finally {
        button.disabled = false;
        button.textContent = '上传';
        refreshCheck();
      }
    });

    input.click();
  });

  // 列表下拉刷新（简版：滚到顶部再下拉触发）
  bindPullRefresh($('#list-body'), () => loadPosts());
  bindPullRefresh($('#shuoshuo-body'), () => loadShuoshuo({ reset: true }));
  bindPullRefresh($('#album-body'), () => loadAlbum({ reset: true }));
  bindPullRefresh($('#pages-body'), () => loadPages({ reset: true }));
  bindPullRefresh($('#links-body'), () => loadLinks());
  bindPullRefresh($('#stats-body'), () => loadStats());

  // 安卓物理返回键
  if (window.Capacitor?.isNativePlatform?.()) {
    App.addListener('backButton', () => {
      if (!el.dialog.hidden) {
        $('#dialog-cancel').click();
      } else if (closeEditorSheets()) {
        // 编辑器内的主题 / 表格面板已关闭
      } else if (!el.shuoshuoSheet.hidden) {
        closeShuoshuoSheet();
      } else if (!el.albumViewer.hidden) {
        closeAlbumViewer();
      } else if (!el.albumSheet.hidden) {
        closeAlbumSheet();
      } else if (!el.pageSheet.hidden) {
        closePageSheet();
      } else if (!el.linkSheet.hidden) {
        closeLinkSheet();
      } else if (!el.itemSheet.hidden) {
        closeItemSheet();
      } else if (!el.historySheet.hidden) {
        hideSheet(el.historySheet, el.historyMask);
      } else if (!el.sheet.hidden) {
        closeSheet();
      } else if (state.view === 'admin') {
        if (!handleAdminBack()) {
          show('me');
        }
      } else if (state.view === 'editor') {
        backToList();
      } else if (state.view === 'detail') {
        closeDetail();
      } else if (state.view === 'shuoshuo') {
        show('list');
      } else if (state.view === 'album') {
        show('list');
      } else if (state.view === 'me') {
        show('list');
      } else if (state.view === 'pages') {
        closePages();
      } else if (state.view === 'links') {
        backFromAdminChild();
      } else if (state.view === 'stats') {
        backFromAdminChild();
      } else if (state.view === 'visitors') {
        show('stats');
      } else if (state.view === 'calendar') {
        backFromAdminChild();
      } else if (state.view === 'settings') {
        // 与屏幕上的返回按钮一致：不保存表单，配置不完整时拦截；
        // 表单全空且未配置时才允许退出 App
        leaveSettings({ allowExit: true });
      } else {
        App.exitApp();
      }
    });

    // 从后台回来：下载可能已经完成，或在后台被系统拦下了安装意图
    App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive || !savedApkUri) {
        return;
      }

      if (updateStage === 'saved' || updateStage === 'failed') {
        if (state.view !== 'settings') {
          openSettings();
        }

        renderUpdatePanel();
        toast('更新已下载，点「安装」继续');
      }
    });
  }
}

applyStyle();
applyTheme();
applyFontSize();
applyAdminEntry();

// 跟随系统时，系统在深浅色之间切换要立即生效
themeQuery?.addEventListener?.('change', () => {
  if ((getSettings().theme || DEFAULT_SETTINGS.theme) === 'auto') {
    applyTheme('auto');
  }
});

migrateLegacyDraft();
bindAppHeight();
// 「我的」页布局偏好需要在首屏渲染前生效，避免切换 Tab 时闪一下
applyMeLayout();
// 清掉早期版本用 base64 文本写坏的安装包，避免占空间或被误用
dropLegacyApk();
// 初始视图：同步底部导航的选中态与 body 标记
show('list');
initAdmin({
  onToast: toast,
  onOpenPages: () => openPages('admin'),
  onOpenLinks: () => {
    adminFrom = 'admin';
    openLinks();
  },
  onOpenStats: () => {
    adminFrom = 'admin';
    openStats();
  },
  onOpenCalendar: () => {
    adminFrom = 'admin';
    openCalendar();
  },
  // 宫格直达工具时，工具页返回直接回「我的」
  onExit: () => show('me'),
  // 概览刷新时同步待审核角标，不必再单独请求一次
  onStats: (data) => setTabBadge(Number(data?.pendingComments || 0)),
});
initDetail({
  onToast: toast,
  onBack: closeDetail,
  onEdit: (cid) => openPost(cid),
  canModerate: () => adminReady(),
  // 审核改了评论数：同步列表角标 + 待审核提醒
  onCommentsChanged: ({ cid, commentsNum }) => {
    if (commentsNum != null) {
      syncCommentCount(cid, commentsNum);
    }

    refreshPendingBadge();
  },
});
bind();
bindQueue();

if (isConfigured()) {
  loadPosts();
  // 首页分类筛选项：静默加载，失败不影响列表
  ensureMetas({ silent: true });
  refreshPendingBadge();
  // 上次断网留下的待发内容，启动即尝试补发
  renderQueueBar();
  flushQueue({ silent: true });

  // 网络恢复时补发，不必等用户回到列表手动刷新
  window.addEventListener('online', () => flushQueue({ silent: true }));

  const lastCheck = Number(localStorage.getItem('sxlb.updateCheck') || 0);
  if (Date.now() - lastCheck > 24 * 3600 * 1000) {
    checkUpdate();
  }
} else {
  openSettings();
}
