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
import { initAdmin, openAdmin, handleAdminBack } from './admin.js';
import {
  newDraftId,
  readDraft,
  writeDraft,
  removeDraft,
  listDrafts,
  pushHistory,
  readHistory,
  migrateLegacyDraft,
} from './local.js';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

const $ = (selector) => document.querySelector(selector);

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
const RELEASE_API = 'https://api.github.com/repos/sxlb/typecho_home/releases/tags/latest';
const DOWNLOAD_URL = 'https://github.com/sxlb/typecho_home/releases/latest/download/sxlb-writer.apk';

const el = {
  views: {
    list: $('#view-list'),
    admin: $('#view-admin'),
    shuoshuo: $('#view-shuoshuo'),
    album: $('#view-album'),
    pages: $('#view-pages'),
    links: $('#view-links'),
    stats: $('#view-stats'),
    visitors: $('#view-visitors'),
    editor: $('#view-editor'),
    settings: $('#view-settings'),
  },
  adminEntry: $('#btn-admin'),
  listLoading: $('#list-loading'),
  listEmpty: $('#list-empty'),
  listItems: $('#list-items'),
  listMore: $('#list-more'),
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
    mode: $('#set-editor-mode'),
    size: $('#set-editor-size'),
    theme: $('#set-theme'),
    style: $('#set-style'),
    custom: $('#custom-theme'),
    accent: $('#set-accent'),
    bg: $('#set-bg'),
    surface: $('#set-surface'),
    radius: $('#set-radius'),
    radiusValue: $('#set-radius-value'),
    adminMode: $('#set-admin-mode'),
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
  // 从相册进入的文章编辑器，返回时回到相册
  albumEditing: false,
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

// ─── 通用 ────────────────────────────────────────────────────────────────

function show(view) {
  state.view = view;

  Object.entries(el.views).forEach(([name, node]) => {
    node.hidden = name !== view;
  });
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
 * 管理模式入口：只控制首页按钮显隐，服务端还有独立的管理接口开关
 */
function applyAdminEntry() {
  el.adminEntry.hidden = (getSettings().adminMode || DEFAULT_SETTINGS.adminMode) !== 'on';
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
    el.listLoading.hidden = false;
    el.listLoading.textContent = '加载中…';
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
    state.hasMore =
      typeof data.total === 'number' ? merged.length < data.total : items.length >= PAGE_SIZE;

    renderList();
    el.listLoading.hidden = true;
  } catch (error) {
    if (seq !== listSeq) {
      return;
    }

    toast(error.message);

    if (reset) {
      state.posts = [];
      renderList();
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

    if (state.selecting) {
      updateBatchBar();
    }

    return;
  }

  const fragment = document.createDocumentFragment();

  drafts.forEach((draft) => {
    fragment.appendChild(
      createItem({
        key: draft.id,
        title: draft.title || '未命名草稿',
        badge: '<span class="badge local">本地草稿</span>',
        time: formatDate((draft.updatedAt || Date.now()) / 1000),
        item: { local: true, id: draft.id, title: draft.title, text: draft.text },
      }),
    );
  });

  serverItems.forEach((item) => {
    // 本地草稿比服务端新：说明上次改动没同步上去，列表上给出提示
    const local = readDraft(String(item.cid));
    const unsynced = Boolean(local && (local.updatedAt || 0) > (item.modified || 0) * 1000);

    const badge = item.scheduled
      ? '<span class="badge scheduled">定时</span>'
      : item.status === 'draft'
        ? '<span class="badge draft">草稿</span>'
        : '<span class="badge">已发布</span>';

    const localBadge = unsynced ? '<span class="badge local">本地有改动</span>' : '';

    fragment.appendChild(
      createItem({
        key: `post-${item.cid}`,
        title: item.title || '未命名文档',
        badge: badge + localBadge,
        time: formatDate(item.created),
        item: { local: false, ...item },
      }),
    );
  });

  el.listItems.appendChild(fragment);
  el.listLoading.hidden = true;

  if (state.selecting) {
    updateBatchBar();
  }
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

function createItem({ title, badge, time, item }) {
  const wrap = document.createElement('div');
  wrap.className = 'post-item';

  // 本地草稿还没同步到服务端，无法批量改状态，保持正常打开行为
  const selectable = state.selecting && !item.local;

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'post-main';
  main.innerHTML = '<div class="post-title"></div><div class="post-meta"></div>';
  main.querySelector('.post-title').textContent = title;
  main.querySelector('.post-meta').innerHTML = `${badge}<span>${time}</span>`;
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
    wrap.appendChild(more);
  }

  return wrap;
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

  try {
    const data = await call('postBatch', { method: 'POST', body: { cids, status } });
    const count = Number(data?.count) || 0;
    const skipped = Number(data?.skipped) || 0;
    const label = status === 'publish' ? '已发布' : '已转为草稿';

    setSelectMode(false);
    await loadPosts({ reset: true });
    toast(skipped > 0 ? `${label} ${count} 篇，跳过 ${skipped} 篇` : `${label} ${count} 篇`);
  } catch (error) {
    toast(error.message);
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
 * 已有文章以服务端 imagePost 为准，新建 / 本地草稿看选中的分类；
 * 隐藏时清空输入，避免把其他文章的旧描述带过去。
 */
function syncAlbumField() {
  const mid = albumCategoryMid();
  const isAlbum = state.imagePost || (mid > 0 && state.selectedMids.has(mid));

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
      syncAlbumField();
      refreshCheck();
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
  el.title.value = title || '';
  fillSheet(meta || {});
  el.editorStatus.textContent = cid ? '已加载' : kind === 'page' ? '新页面' : '新文章';

  // 页面复用同一套编辑器，但保存语义不同：设置走抽屉，「保存」直接提交
  $('#btn-save').textContent = kind === 'page' ? '设置' : '保存';
  $('#btn-publish').textContent = kind === 'page' ? '保存' : '发布';
  el.preview.hidden = !state.currentUrl;

  show('editor');

  initEditor({
    value: text || '',
    mode: getSettings().editorMode,
    onChange: () => {
      state.dirty = true;
      el.editorStatus.textContent = '编辑中…';
      scheduleAutosave();
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

function scheduleAutosave() {
  clearTimeout(state.autosaveTimer);
  state.autosaveTimer = setTimeout(() => {
    persistLocal();
    maybeSnapshot();
    const now = new Date();
    el.editorStatus.textContent = `已存本地 ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes(),
    ).padStart(2, '0')}`;
  }, 1200);
}

function persistLocal() {
  if (!state.draftKey) {
    return;
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
    slug: el.slug.value,
    created: el.created.value,
  };

  // 页面没有分类 / 标签，额外保存模板、状态、排序等页面设置
  if (state.kind === 'page' && state.pageMeta) {
    data.slug = state.pageMeta.slug || '';
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
  ];

  if (pairs.some(([local, remote]) => String(local ?? '') !== String(remote ?? ''))) {
    return true;
  }

  const localMids = Array.isArray(draft.mid) ? [...draft.mid].map(Number).sort() : [];
  const remoteMids = (post.categories || []).map(Number).sort();

  return JSON.stringify(localMids) !== JSON.stringify(remoteMids);
}

async function openPost(cid) {
  try {
    const post = await call('post', { query: { cid } });
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
        slug: source.slug ?? post.slug,
        mid: [...state.selectedMids],
        imagePost: Boolean(post.imagePost),
      },
    });

    if (useLocal) {
      toast('已恢复本地草稿');
    }
  } catch (error) {
    toast(error.message);
  }
}

function backToList() {
  // 输入后 1.2 秒内返回时防抖计时器会被清掉，这里补一次落盘与快照，避免丢内容
  if (state.draftKey) {
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

  // 从相册进入的编辑，保存或返回后回相册并刷新，避免跳到首页
  if (state.albumEditing) {
    state.albumEditing = false;
    show('album');
    loadAlbum({ reset: true });
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
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'album-card';

  const cover = document.createElement('span');
  cover.className = 'album-cover';

  if (item.cover) {
    const image = document.createElement('img');
    image.src = item.cover;
    image.alt = '';
    image.loading = 'lazy';
    // 图片挂了也给出占位，避免网格里出现空洞
    image.addEventListener('error', () => {
      image.remove();
      cover.classList.add('empty');

      const fallback = document.createElement('span');
      fallback.textContent = '无图';
      cover.prepend(fallback);
    });
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
  card.addEventListener('click', () => openAlbumViewer(item));

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
  state.albumEditing = true;
  await openPost(item.cid);

  // 打开失败时 openPost 内部只 toast，这里清掉标记，避免下次返回误跳相册
  if (state.view !== 'editor') {
    state.albumEditing = false;
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

/** 管理页入口与首页都能打开页面列表 */
function openPages(from = 'list') {
  if (!isConfigured()) {
    openSettings();
    return;
  }

  state.pagesFrom = from === 'admin' ? 'admin' : 'list';
  show('pages');
  loadPages({ reset: true });
}

/** 页面列表返回：从管理页进来就回管理页 */
function closePages() {
  show(state.pagesFrom === 'admin' ? 'admin' : 'list');
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
  return listDrafts().filter((draft) => String(draft.id).startsWith('page-'));
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

    fragment.appendChild(
      createItem({
        key: `page-${item.cid}`,
        title: item.title || '未命名页面',
        badge: statusBadge + templateBadge,
        time: formatDate(item.created),
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
  try {
    const page = await call('page', { query: { cid } });
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
    pageMeta: { slug: '', template: '', status: 'publish', order: 0, allowComment: true },
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
    cid: 0,
    draftKey: id,
    kind: 'page',
    title: draft.title || '',
    text: draft.text || '',
    meta: {},
    pageMeta: {
      slug: draft.slug || '',
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

  el.pageTemplate.value = selected && templates[selected] ? selected : '';
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
  state.dirty = true;
  closePageSheet();
  scheduleAutosave();
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
  const body = {
    cid: state.cid,
    title,
    text,
    slug: meta.slug || '',
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

// 抽屉关闭动画延时器：快速连续开关时取消上一次
let sheetTimer = null;

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
  clearTimeout(sheetTimer);
  sheet.hidden = false;
  mask.hidden = false;
  syncModalLock();
  requestAnimationFrame(() => {
    sheet.classList.add('open');
    mask.classList.add('open');
  });
}

function hideSheet(sheet, mask) {
  sheet.classList.remove('open');
  mask.classList.remove('open');
  clearTimeout(sheetTimer);
  sheetTimer = setTimeout(() => {
    sheet.hidden = true;
    mask.hidden = true;
    syncModalLock();
  }, 260);
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
    items.push({ level: 'error', label: '标题还没填', fix: 'title' });
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
  renderCheck({ isDraft: true, expand: false });
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
    renderCheck({ isDraft, expand: true });
    toast(errors[0].label);
    return;
  }

  // 只有建议项时，先展开清单并让发布按钮进入二次确认，避免每篇都被拦
  if (!isDraft && warnings.length && !state.allowWarnings) {
    state.allowWarnings = true;
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
    removeDraft(String(previousKey));
    removeDraft(String(result.cid));

    closeSheet();
    destroyEditor();
    state.draftKey = '';

    // 从相册进入的编辑，保存后回相册并刷新，而不是跳回首页列表
    if (state.albumEditing) {
      state.albumEditing = false;
      show('album');
      await loadAlbum({ reset: true });
      $('#album-body').scrollTop = 0;
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
  const settings = getSettings();
  el.settings.server.value = settings.server || DEFAULT_SETTINGS.server;
  el.settings.token.value = settings.token || '';
  el.settings.secret.value = settings.secret || '';
  el.settings.mode.value = settings.editorMode || DEFAULT_SETTINGS.editorMode;
  el.settings.size.value = settings.editorFontSize || DEFAULT_SETTINGS.editorFontSize;
  el.settings.theme.value = settings.theme || DEFAULT_SETTINGS.theme;
  el.settings.adminMode.value = settings.adminMode || DEFAULT_SETTINGS.adminMode;

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

  renderVersion();
  show('settings');
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
}

async function testConnection() {
  saveSettingsFromForm();

  if (!isConfigured()) {
    toast('请先填写完整信息');
    return;
  }

  try {
    const data = await call('ping');
    toast(`已连接：${data.site}`);
  } catch (error) {
    toast(error.message);
  }
}

function saveSettingsFromForm() {
  saveSettings({
    server: el.settings.server.value.trim() || DEFAULT_SETTINGS.server,
    token: el.settings.token.value.trim(),
    secret: el.settings.secret.value.trim(),
    editorMode: el.settings.mode.value || DEFAULT_SETTINGS.editorMode,
    editorFontSize: el.settings.size.value || DEFAULT_SETTINGS.editorFontSize,
    theme: el.settings.theme.value || DEFAULT_SETTINGS.theme,
    style: styleSelection,
    customTheme: readCustomForm(),
    adminMode: el.settings.adminMode.value || DEFAULT_SETTINGS.adminMode,
  });
  applyStyle();
  applyTheme();
  applyFontSize();
  applyAdminEntry();
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

async function checkUpdate(manual = false) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error('release');
    }

    const data = await response.json();
    const match = String(data.body || '').match(/版本[：:]\s*v?([\d.]+)/);

    if (!match) {
      throw new Error('version');
    }

    state.update = { version: match[1] };
    renderVersion();

    if (compareVersion(match[1], APP_VERSION) > 0) {
      if (manual) {
        await copyText(DOWNLOAD_URL);
        toast(`发现新版本 v${match[1]}，下载链接已复制`);
      } else {
        toast(`发现新版本 v${match[1]}，设置页可查看`);
      }
    } else if (manual) {
      toast('当前已是最新版本');
    }

    // 只有检查成功才记录时间：失败时下次打开还会重试
    try {
      localStorage.setItem('sxlb.updateCheck', String(Date.now()));
    } catch {
      // 存储已满时忽略，不影响更新检查
    }
  } catch {
    if (manual) {
      toast('检查更新失败，请稍后再试');
    }
  } finally {
    clearTimeout(timer);
  }
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
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-shuoshuo').addEventListener('click', openShuoshuo);
  $('#btn-shuoshuo-back').addEventListener('click', () => show('list'));
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
  $('#btn-album').addEventListener('click', openAlbum);
  $('#btn-album-back').addEventListener('click', () => show('shuoshuo'));
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
  $('#btn-admin').addEventListener('click', () => {
    show('admin');
    openAdmin();
  });
  $('#btn-admin-back').addEventListener('click', () => show('list'));
  $('#btn-pages-back').addEventListener('click', closePages);
  $('#btn-pages-refresh').addEventListener('click', () => loadPages({ reset: true }));
  $('#btn-pages-new').addEventListener('click', openNewPage);
  el.pagesMore.addEventListener('click', () => {
    pages.page += 1;
    loadPages({ reset: false });
  });
  $('#page-sheet-close').addEventListener('click', closePageSheet);
  $('#page-sheet-cancel').addEventListener('click', closePageSheet);
  el.pageMask.addEventListener('click', closePageSheet);
  $('#page-sheet-done').addEventListener('click', applyPageSheet);
  $('#btn-links-back').addEventListener('click', () => show('admin'));
  $('#btn-links-refresh').addEventListener('click', loadLinks);
  $('#btn-links-new').addEventListener('click', () => openLinkSheet(null));
  el.linkMask.addEventListener('click', closeLinkSheet);
  $('#link-sheet-close').addEventListener('click', closeLinkSheet);
  $('#link-sheet-cancel').addEventListener('click', closeLinkSheet);
  $('#link-sheet-done').addEventListener('click', saveLink);
  el.linkDelete.addEventListener('click', deleteLink);
  $('#btn-stats-back').addEventListener('click', () => show('admin'));
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
    saveSettingsFromForm();

    if (isConfigured()) {
      show('list');
      loadPosts();
    } else {
      show('settings');
    }
  });

  $('#btn-history').addEventListener('click', openHistory);
  $('#history-close').addEventListener('click', () => hideSheet(el.historySheet, el.historyMask));
  el.historyMask.addEventListener('click', () => hideSheet(el.historySheet, el.historyMask));
  $('#item-close').addEventListener('click', closeItemSheet);
  el.itemMask.addEventListener('click', closeItemSheet);

  el.listSearch.addEventListener('input', () => {
    state.query = el.listSearch.value;
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
    [...el.listFilters.children].forEach((chip) => {
      chip.classList.toggle('active', chip === button);
    });
    renderList();

    // 分页数据是按上一个筛选条件拉取的，切换后必须重新请求，避免「全部」只剩残缺列表
    if (isConfigured()) {
      loadPosts({ reset: true });
    }
  });

  // 分类筛选：切换后重新从服务端拉第一页
  el.listCategory?.addEventListener('change', () => {
    state.category = Number(el.listCategory.value) || 0;

    if (isConfigured()) {
      loadPosts({ reset: true });
    } else {
      renderList();
    }
  });

  // 编辑器里的弹层由 editor.js 派发事件，统一重算滚动锁
  window.addEventListener('sxlb:overlay', syncModalLock);

  el.title.addEventListener('input', () => {
    state.dirty = true;
    scheduleAutosave();
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
  });

  $('#btn-test').addEventListener('click', testConnection);
  $('#btn-save-settings').addEventListener('click', () => {
    saveSettingsFromForm();
    toast('设置已保存');
    loadPosts();
  });
  $('#btn-check-update').addEventListener('click', () => checkUpdate(true));

  // 外观切换即时预览，点「保存设置」或返回时一并落盘
  el.settings.theme.addEventListener('change', () => applyTheme(el.settings.theme.value));
  el.settings.size.addEventListener('change', () => applyFontSize(el.settings.size.value));

  // 界面风格：点一下立即换肤，保存或返回时落盘
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
          show('list');
        }
      } else if (state.view === 'editor') {
        backToList();
      } else if (state.view === 'shuoshuo') {
        show('list');
      } else if (state.view === 'album') {
        show('shuoshuo');
      } else if (state.view === 'pages') {
        closePages();
      } else if (state.view === 'links') {
        show('admin');
      } else if (state.view === 'stats') {
        show('admin');
      } else if (state.view === 'visitors') {
        show('stats');
      } else if (state.view === 'settings') {
        isConfigured() ? show('list') : App.exitApp();
      } else {
        App.exitApp();
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
initAdmin({
  onToast: toast,
  onOpenPages: () => openPages('admin'),
  onOpenLinks: openLinks,
  onOpenStats: openStats,
});
bind();

if (isConfigured()) {
  loadPosts();
  // 首页分类筛选项：静默加载，失败不影响列表
  ensureMetas({ silent: true });

  const lastCheck = Number(localStorage.getItem('sxlb.updateCheck') || 0);
  if (Date.now() - lastCheck > 24 * 3600 * 1000) {
    checkUpdate(false);
  }
} else {
  openSettings();
}
