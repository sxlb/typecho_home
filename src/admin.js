/**
 * 管理页：站点概览、插件启停、插件配置、站点设置、当前主题设置
 *
 * 接口统一走 callAdmin()，签名路径为 /writer-api/admin/{do}。
 * 这里只负责渲染与交互，鉴权、开关判断都在服务端完成。
 */

import { callAdmin, uploadImage } from './api.js';
import { listReplies, addReply, removeReply } from './local.js';

const $ = (selector) => document.querySelector(selector);

// 评论搜索防抖计时器
let searchTimer = 0;

const el = {
  body: $('#admin-body'),
  loading: $('#admin-loading'),
  error: $('#admin-error'),
  errorText: $('#admin-error-text'),
  overview: $('#admin-overview'),
  tabs: $('#admin-tabs'),
  // 统计已移到「我的」页常驻显示
  siteName: $('#me-site'),
  stats: $('#me-stats'),
  statsHint: $('#me-stats-hint'),
  content: $('#admin-content'),
  entries: $('#admin-entries'),
  plugins: $('#admin-plugins'),
  config: $('#admin-config'),
  configTitle: $('#admin-config-title'),
  configBody: $('#admin-config-body'),
  save: $('#btn-admin-config-save'),
  tools: $('#admin-tools'),
  toolsTitle: $('#admin-tools-title'),
  toolsFilters: $('#admin-tools-filters'),
  toolsList: $('#admin-tools-list'),
  toolsMore: $('#btn-admin-tools-more'),
};

const state = {
  panel: null, // { kind: 'plugin' | 'site' | 'theme', name?, group?, title }
  overview: {},
  plugins: [],
  siteGroups: [],
  tool: null, // { kind: 'comments' | 'media', status, page, items, total, busy }
  loaded: false,
  busy: false,
  statsBusy: false,
  pendingOff: '',
  pendingTimer: 0,
};

let toast = () => {};
let onOpenPages = () => {};
let onOpenLinks = () => {};
let onOpenStats = () => {};
let onOpenCalendar = () => {};

export function initAdmin(options = {}) {
  toast = typeof options.onToast === 'function' ? options.onToast : toast;
  onOpenPages = typeof options.onOpenPages === 'function' ? options.onOpenPages : onOpenPages;
  onOpenLinks = typeof options.onOpenLinks === 'function' ? options.onOpenLinks : onOpenLinks;
  onOpenStats = typeof options.onOpenStats === 'function' ? options.onOpenStats : onOpenStats;
  onOpenCalendar = typeof options.onOpenCalendar === 'function'
    ? options.onOpenCalendar
    : onOpenCalendar;

  $('#btn-admin-refresh').addEventListener('click', () => load());
  $('#btn-admin-retry').addEventListener('click', () => load());
  $('#btn-admin-config-back').addEventListener('click', showList);
  $('#btn-admin-tools-back').addEventListener('click', showList);

  // 分段切换：一次只显示一类，减少单屏信息量
  el.tabs?.addEventListener('click', (event) => {
    const button = event.target.closest('.admin-tab');

    if (button) {
      switchTab(button.dataset.tab);
    }
  });
  $('#btn-admin-tools-more').addEventListener('click', () => {
    if (!state.tool || state.tool.busy) {
      return;
    }

    // 页码由 loadToolPage 在请求成功后提交，失败时不会跳过一页
    loadToolPage(false);
  });
  el.save.addEventListener('click', savePanel);
}

/**
 * 打开管理页并拉取数据
 *
 * @param {'content'|'site'|'plugins'} [tab] 初始分段，由「我的」页的二级入口决定
 */
export async function openAdmin(tab = 'content') {
  if (state.busy) {
    return;
  }

  showList();
  switchTab(tab);
  await load();
}

/**
 * 管理模式开关：控制「我的」页的管理入口与概览区
 *
 * @param {boolean} enabled 是否可用（本地开关开启且已配置服务器）
 * @param {string} [reason] 不可用时的提示文案
 */
export function setAdminEnabled(enabled, reason = '') {
  const group = $('#me-admin-group');

  if (group) {
    group.hidden = !enabled;
  }

  if (!enabled) {
    if (el.siteName) {
      el.siteName.hidden = true;
    }

    showStatsHint(reason);
    return;
  }

  hideStatsHint();
}

/**
 * 「我的」页的概览统计：只拉 overview，不渲染管理页容器
 *
 * 失败时保留上次数据并显示提示，不打断「我的」页其他入口。
 */
export async function refreshMeStats() {
  if (state.statsBusy) {
    return;
  }

  state.statsBusy = true;

  try {
    const data = await callAdmin('overview');
    state.overview = data || {};
    renderStats(state.overview);
    hideStatsHint();
  } catch (error) {
    showStatsHint(`概览加载失败：${error.message}`);
  } finally {
    state.statsBusy = false;
  }
}

/**
 * 物理返回键：配置面板打开时先回概览
 *
 * @returns {boolean} 是否已消费返回事件
 */
export function handleAdminBack() {
  if (state.tool) {
    showList();
    return true;
  }

  if (state.panel) {
    showList();
    return true;
  }

  return false;
}

// ─── 数据 ────────────────────────────────────────────────────────────────

async function load() {
  if (state.busy) {
    return;
  }

  state.busy = true;
  state.loaded = false;
  clearPendingOff();
  el.error.hidden = true;
  el.overview.hidden = true;
  el.config.hidden = true;
  el.tools.hidden = true;
  state.tool = null;
  el.loading.hidden = false;
  el.loading.textContent = '加载中…';

  try {
    const [overview, plugins, site] = await Promise.all([
      callAdmin('overview'),
      callAdmin('plugins'),
      callAdmin('siteConfig'),
    ]);

    state.siteGroups = Array.isArray(site?.groups) ? site.groups : [];
    state.plugins = Array.isArray(plugins?.items) ? plugins.items : [];
    state.overview = overview || {};

    renderStats(state.overview);
    renderContent();
    renderEntries();
    renderPlugins();
    state.loaded = true;
    el.overview.hidden = false;
  } catch (error) {
    showError(error.message);
  } finally {
    state.busy = false;
    el.loading.hidden = true;
  }
}

function showList() {
  state.panel = null;
  state.tool = null;
  // 离开列表时取消未发出的搜索，避免旧 tool 被异步回调使用
  window.clearTimeout(searchTimer);
  clearPendingOff();
  el.config.hidden = true;
  el.tools.hidden = true;
  el.error.hidden = true;
  el.loading.hidden = true;
  el.overview.hidden = !state.loaded;
}

/**
 * 切换管理页分段
 *
 * @param {'content'|'site'|'plugins'} name
 */
function switchTab(name) {
  el.tabs?.querySelectorAll('.admin-tab').forEach((button) => {
    const active = button.dataset.tab === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });

  el.overview.querySelectorAll('.admin-panel').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== name;
  });

  // 切段后回到顶部，否则从长列表切到短面板会停在空白处
  el.body.scrollTop = 0;
}

function showError(message) {
  el.loading.hidden = true;
  el.overview.hidden = true;
  el.config.hidden = true;
  el.tools.hidden = true;
  el.error.hidden = false;
  el.errorText.textContent = message || '请检查网络与服务端配置';
}

// ─── 概览 ────────────────────────────────────────────────────────────────

function renderStats(data) {
  // 站点名放在「我的」页概览标题右侧，一眼知道在看哪个站
  if (el.siteName) {
    el.siteName.textContent = data.site || '';
    el.siteName.hidden = !data.site;
  }

  hideStatsHint();

  const items = [
    { label: '已发布', value: data.posts },
    { label: '草稿', value: data.drafts },
    {
      label: '评论',
      value: data.comments,
      hint: data.pendingComments ? `${data.pendingComments} 条待审核` : '',
    },
    { label: '媒体', value: data.media },
    { label: '分类', value: data.categories },
    { label: '标签', value: data.tags },
  ];

  el.stats.innerHTML = '';

  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'stat-card';

    const value = document.createElement('div');
    value.className = 'stat-value';
    value.textContent = Number(item.value || 0).toLocaleString('zh-CN');

    const label = document.createElement('div');
    label.className = 'stat-label';
    label.textContent = item.label;

    card.append(value, label);

    if (item.hint) {
      const hint = document.createElement('div');
      hint.className = 'stat-hint';
      hint.textContent = item.hint;
      card.appendChild(hint);
    }

    el.stats.appendChild(card);
  });
}

/**
 * 统计加载失败时在「我的」页给出提示，说明入口为何没显示
 *
 * @param {string} [message]
 */
function showStatsHint(message) {
  if (!el.statsHint) {
    return;
  }

  el.statsHint.textContent = message
    || '先在设置里开启「管理模式」，并确认插件已打开管理接口';
  el.statsHint.hidden = false;
  el.stats.hidden = true;
}

function hideStatsHint() {
  if (el.statsHint) {
    el.statsHint.hidden = true;
  }

  if (el.stats) {
    el.stats.hidden = false;
  }
}

// ─── 设置入口 ────────────────────────────────────────────────────────────

const SITE_DESCRIPTIONS = {
  general: '站点名称、地址、时区与上传类型',
  reading: '首页展示、分页与 Feed 输出',
  discussion: '评论审核、显示与提交限制',
  permalink: '文章、页面与分类的链接路径',
};

function renderEntries() {
  el.entries.innerHTML = '';

  const entries = state.siteGroups.map((group) => ({
    key: group.key,
    title: group.title,
    description: SITE_DESCRIPTIONS[group.key] || '站点设置',
  }));

  entries.push({
    key: 'theme',
    title: '主题设置',
    description: '当前主题的配置项',
  });

  entries.push({
    key: 'cache',
    title: '清理主题缓存',
    description: '删除 Handsome 渲染缓存，前台立即刷新',
  });

  entries.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'plugin-item';

    const info = document.createElement('div');
    info.className = 'plugin-info';

    const title = document.createElement('div');
    title.className = 'plugin-title';
    title.textContent = entry.title;

    const desc = document.createElement('div');
    desc.className = 'plugin-meta';
    desc.textContent = entry.description;

    info.append(title, desc);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn ghost small';

    if (entry.key === 'cache') {
      button.textContent = '清理';
      bindClearCache(button);
    } else {
      button.textContent = '打开';
      button.addEventListener('click', () => {
        if (entry.key === 'theme') {
          openPanel({ kind: 'theme', title: '主题设置' });
        } else {
          openPanel({ kind: 'site', group: entry.key, title: entry.title });
        }
      });
    }

    row.append(info, button);
    el.entries.appendChild(row);
  });
}

/**
 * 清理主题缓存
 *
 * 两步确认防误触：第一次点击变成「确认清理」，4 秒内不点自动还原。
 */
function bindClearCache(button) {
  let armed = false;
  let timer = 0;

  const reset = () => {
    armed = false;
    button.textContent = '清理';
  };

  button.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      button.textContent = '确认清理';
      timer = window.setTimeout(reset, 4000);
      return;
    }

    window.clearTimeout(timer);
    armed = false;
    button.disabled = true;
    button.textContent = '清理中…';

    try {
      await callAdmin('clearCache', { method: 'POST', body: {} });
      toast('主题缓存已清理');
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = '清理';
    }
  });
}

// ─── 内容入口 ────────────────────────────────────────────────────────────

function renderContent() {
  const overview = state.overview || {};
  const entries = [
    {
      key: 'stats',
      title: '数据看板',
      description: '发布、评论趋势与分类分布',
    },
    {
      key: 'comments',
      title: '评论管理',
      description: overview.pendingComments
        ? `${overview.pendingComments} 条待审核，共 ${overview.comments || 0} 条`
        : `共 ${overview.comments || 0} 条评论`,
    },
    {
      key: 'media',
      title: '媒体库',
      description: `共 ${overview.media || 0} 个文件`,
    },
    {
      key: 'metas',
      title: '分类与标签',
      description: `${overview.categories || 0} 个分类 · ${overview.tags || 0} 个标签`,
    },
    {
      key: 'pages',
      title: '独立页面',
      description: '关于、友链、时光机等自定义页面',
    },
    {
      key: 'links',
      title: '友情链接',
      description: '增删改友链、设置显示位置与排序',
    },
    {
      key: 'calendar',
      title: '发布日历',
      description: '按月查看已发布、定时与草稿',
    },
  ];

  el.content.innerHTML = '';

  entries.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'plugin-item';

    const info = document.createElement('div');
    info.className = 'plugin-info';

    const title = document.createElement('div');
    title.className = 'plugin-title';
    title.textContent = entry.title;

    const desc = document.createElement('div');
    desc.className = 'plugin-meta';
    desc.textContent = entry.description;

    info.append(title, desc);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn ghost small';
    button.textContent = '打开';
    button.addEventListener('click', () => {
      if (entry.key === 'stats') {
        onOpenStats();
        return;
      }

      if (entry.key === 'pages') {
        onOpenPages();
        return;
      }

      if (entry.key === 'links') {
        onOpenLinks();
        return;
      }

      if (entry.key === 'calendar') {
        onOpenCalendar();
        return;
      }

      openTool(entry.key);
    });

    row.append(info, button);
    el.content.appendChild(row);
  });
}

// ─── 评论 / 媒体列表 ─────────────────────────────────────────────────────

const COMMENT_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'waiting', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'spam', label: '垃圾' },
];

const COMMENT_STATUS = {
  approved: { label: '已通过', className: 'on' },
  waiting: { label: '待审核', className: 'wait' },
  spam: { label: '垃圾', className: 'off' },
};

function openTool(kind) {
  let status = '';

  if (kind === 'comments') {
    status = Number(state.overview?.pendingComments || 0) > 0 ? 'waiting' : 'all';
  } else if (kind === 'metas') {
    status = 'category';
  }

  state.tool = {
    kind,
    status,
    page: 1,
    items: [],
    total: 0,
    busy: false,
    // 请求令牌：递增后旧请求的响应会被丢弃
    reqId: 0,
    edit: null,
    categories: [],
    tags: [],
    // 评论搜索关键词，其他工具不使用
    keyword: '',
  };
  state.panel = null;

  el.config.hidden = true;
  el.error.hidden = true;
  el.loading.hidden = true;
  el.overview.hidden = true;
  el.tools.hidden = false;
  el.toolsTitle.textContent = kind === 'comments'
    ? '评论管理'
    : (kind === 'metas' ? '分类与标签' : '媒体库');
  el.toolsList.innerHTML = '';
  el.toolsMore.hidden = true;
  renderToolFilters();
  el.body.scrollTop = 0;

  loadToolPage(true);
}

function renderToolFilters() {
  const tool = state.tool;
  el.toolsFilters.innerHTML = '';

  if (!tool) {
    el.toolsFilters.hidden = true;
    return;
  }

  if (tool.kind === 'comments') {
    el.toolsFilters.hidden = false;

    // 搜索框：作者 / 内容 / 文章标题，交给服务端检索，才能搜到未加载的页
    const box = document.createElement('div');
    box.className = 'tool-search';

    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = '搜索作者、内容或文章标题';
    input.value = tool.keyword;

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'tool-search-clear';
    clear.textContent = '×';
    clear.setAttribute('aria-label', '清空搜索');
    clear.hidden = !tool.keyword;

    input.addEventListener('input', () => {
      const value = input.value;
      clear.hidden = !value;

      // 输入防抖：停止 320ms 后才请求，避免每敲一个字都打一次接口
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        // 期间切走了工具，丢弃这次请求
        if (state.tool !== tool) {
          return;
        }

        tool.keyword = value.trim();
        tool.page = 1;
        tool.items = [];
        loadToolPage(true);
      }, 320);
    });

    clear.addEventListener('click', () => {
      window.clearTimeout(searchTimer);
      tool.keyword = '';
      tool.page = 1;
      tool.items = [];
      renderToolFilters();
      loadToolPage(true);
    });

    box.append(input, clear);
    el.toolsFilters.appendChild(box);

    COMMENT_FILTERS.forEach((filter) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `chip${tool.status === filter.key ? ' active' : ''}`;
      button.textContent = filter.label;
      button.addEventListener('click', () => {
        if (tool.status === filter.key) {
          return;
        }

        tool.status = filter.key;
        tool.page = 1;
        tool.items = [];
        renderToolFilters();
        loadToolPage(true);
      });

      el.toolsFilters.appendChild(button);
    });

    return;
  }

  if (tool.kind === 'metas') {
    el.toolsFilters.hidden = false;

    [{ key: 'category', label: '分类' }, { key: 'tag', label: '标签' }].forEach((tab) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `chip${tool.status === tab.key ? ' active' : ''}`;
      button.textContent = tab.label;
      button.addEventListener('click', () => {
        if (tool.status === tab.key) {
          return;
        }

        tool.status = tab.key;
        tool.edit = null;
        tool.items = [];
        renderToolFilters();
        loadToolPage(true);
      });

      el.toolsFilters.appendChild(button);
    });

    const create = toolButton(tool.status === 'category' ? '新建分类' : '新建标签', 'primary', () => {
      tool.edit = { mid: 0, name: '', slug: '', description: '', order: 0, parent: 0 };
      renderToolItems();
    });
    el.toolsFilters.appendChild(create);

    return;
  }

  // 媒体库：直接上传，cid = 0 表示不关联文章
  el.toolsFilters.hidden = false;

  const input = document.createElement('input');
  input.type = 'file';
  // 不写死 accept：服务端按后台「允许上传类型」白名单校验，这里放开由服务端把关
  input.hidden = true;

  const button = toolButton('上传文件', 'primary', () => input.click());

  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];

    if (!file) {
      return;
    }

    // 非图片不做前端压缩，超过常见 2M 上传上限时提前提示，避免白传一趟
    if (!/^image\//.test(file.type) && file.size > 2 * 1024 * 1024) {
      input.value = '';
      toast('文件超过 2M，可能超出服务器上传限制');
      return;
    }

    button.disabled = true;
    button.textContent = '上传中…';

    try {
      await uploadImage(file, 0);
      toast('上传成功');
      await reloadTool();
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = '上传文件';
      input.value = '';
    }
  });

  el.toolsFilters.append(button, input);
}

async function loadToolPage(reset) {
  const tool = state.tool;

  if (!tool) {
    return;
  }

  // 请求令牌：切换筛选 / 搜索时旧请求可能后返回，令牌不一致就丢弃，
  // 避免旧结果覆盖新筛选的列表
  const reqId = (tool.reqId || 0) + 1;
  tool.reqId = reqId;
  tool.busy = true;
  el.toolsMore.disabled = true;
  el.toolsMore.textContent = '加载中…';

  // 页码在请求成功后才提交：失败时保持原页码，避免「加载更多」跳过一页
  const page = reset ? 1 : tool.page + 1;
  const isCurrent = () => state.tool === tool && tool.reqId === reqId;

  try {
    if (tool.kind === 'metas') {
      const data = await callAdmin('metas');

      if (!isCurrent()) {
        return;
      }

      tool.categories = Array.isArray(data?.categories) ? data.categories : [];
      tool.tags = Array.isArray(data?.tags) ? data.tags : [];
      tool.items = tool.status === 'category' ? tool.categories : tool.tags;
      tool.total = tool.items.length;
    } else {
      const query = { page, size: tool.kind === 'comments' ? 20 : 24 };

      if (tool.kind === 'comments' && tool.status !== 'all') {
        query.status = tool.status;
      }

      if (tool.kind === 'comments' && tool.keyword) {
        query.keyword = tool.keyword;
      }

      const data = await callAdmin(tool.kind === 'comments' ? 'comments' : 'media', { query });

      if (!isCurrent()) {
        return;
      }

      const items = Array.isArray(data?.items) ? data.items : [];

      tool.page = page;
      tool.items = reset ? items : tool.items.concat(items);
      tool.total = Number(data?.total || 0);
    }

    renderToolItems();
  } catch (error) {
    if (!isCurrent()) {
      return;
    }

    toast(error.message);
  } finally {
    if (isCurrent()) {
      tool.busy = false;
      updateMore();
    }
  }
}

function updateMore() {
  const tool = state.tool;

  if (!tool) {
    el.toolsMore.hidden = true;
    return;
  }

  el.toolsMore.disabled = false;
  el.toolsMore.textContent = '加载更多';
  el.toolsMore.hidden = tool.items.length === 0 || tool.items.length >= tool.total;
}

function renderToolItems() {
  const tool = state.tool;

  if (!tool) {
    return;
  }

  el.toolsList.innerHTML = '';

  if (tool.kind === 'metas' && tool.edit) {
    el.toolsList.appendChild(renderMetaForm());
  }

  if (!tool.items.length) {
    const empty = document.createElement('p');
    empty.className = 'plugin-empty';
    empty.textContent = tool.kind === 'comments'
      ? '没有符合条件的评论'
      : (tool.kind === 'metas' ? '还没有分类或标签' : '还没有上传过文件');
    el.toolsList.appendChild(empty);
    return;
  }

  if (tool.kind === 'comments') {
    tool.items.forEach((item) => el.toolsList.appendChild(renderComment(item)));
  } else if (tool.kind === 'metas') {
    tool.items.forEach((item) => el.toolsList.appendChild(renderMeta(item)));
  } else {
    tool.items.forEach((item) => el.toolsList.appendChild(renderMedia(item)));
  }
}

/**
 * 分类 / 标签的编辑表单（新建与编辑共用）
 */
function renderMetaForm() {
  const tool = state.tool;
  const draft = tool.edit;
  const isCategory = tool.status === 'category';
  const row = document.createElement('div');
  row.className = 'tool-item meta-form';

  const title = document.createElement('div');
  title.className = 'tool-title';
  title.textContent = draft.mid > 0
    ? (isCategory ? '编辑分类' : '编辑标签')
    : (isCategory ? '新建分类' : '新建标签');

  const nameField = fieldInput('名称', draft.name || '');
  const slugField = fieldInput('Slug', draft.slug || '', '留空自动生成');
  const orderField = fieldInput('排序', String(draft.order || 0), '', 'number');

  // 输入实时同步回草稿：列表重建（如加载更多）时不会丢掉已填内容
  nameField.input.addEventListener('input', () => {
    draft.name = nameField.input.value;
  });
  slugField.input.addEventListener('input', () => {
    draft.slug = slugField.input.value;
  });
  orderField.input.addEventListener('input', () => {
    draft.order = Number(orderField.input.value || 0);
  });

  row.append(title, nameField.wrap, slugField.wrap, orderField.wrap);

  let descriptionField = null;

  if (isCategory) {
    descriptionField = fieldInput('描述', draft.description || '', '', 'textarea');
    descriptionField.input.addEventListener('input', () => {
      draft.description = descriptionField.input.value;
    });
    row.appendChild(descriptionField.wrap);

    const parent = parentSelect(draft);
    const parentSelectEl = parent.querySelector('[data-parent]');

    if (parentSelectEl) {
      parentSelectEl.addEventListener('change', () => {
        draft.parent = Number(parentSelectEl.value || 0);
      });
    }

    row.appendChild(parent);
  }

  const actions = document.createElement('div');
  actions.className = 'tool-actions';

  const save = toolButton('保存', 'primary', async () => {
    const values = {
      name: nameField.input.value.trim(),
      slug: slugField.input.value.trim(),
      order: Number(orderField.input.value || 0),
      description: descriptionField ? descriptionField.input.value : '',
      parent: isCategory ? Number(row.querySelector('[data-parent]')?.value || 0) : 0,
    };

    if (!values.name) {
      toast('名称不能为空');
      return;
    }

    if (!draft.mid) {
      values.type = tool.status;
    }

    save.disabled = true;
    save.textContent = '保存中…';

    try {
      await callAdmin('metaSave', { method: 'POST', body: { mid: draft.mid, values } });
      tool.edit = null;
      toast('已保存');
      await reloadTool();
    } catch (error) {
      toast(error.message);
      save.disabled = false;
      save.textContent = '保存';
    }
  });

  const cancel = toolButton('取消', 'ghost', () => {
    tool.edit = null;
    renderToolItems();
  });

  actions.append(save, cancel);
  row.appendChild(actions);

  return row;
}

function fieldInput(label, value, hint = '', type = 'text') {
  const wrap = document.createElement('div');
  wrap.className = 'field';

  const text = document.createElement('label');
  text.className = 'field-label';
  text.textContent = label;

  let input;

  if (type === 'textarea') {
    input = document.createElement('textarea');
    input.rows = 2;
  } else {
    input = document.createElement('input');
    input.type = type;
  }

  input.value = value;
  wrap.append(text, input);

  if (hint) {
    const tip = document.createElement('span');
    tip.className = 'field-desc';
    tip.textContent = hint;
    wrap.appendChild(tip);
  }

  return { wrap, input };
}

function parentSelect(draft) {
  const wrap = document.createElement('div');
  wrap.className = 'field';

  const label = document.createElement('label');
  label.className = 'field-label';
  label.textContent = '父分类';

  const select = document.createElement('select');
  select.dataset.parent = '1';

  const top = document.createElement('option');
  top.value = '0';
  top.textContent = '顶级分类';
  select.appendChild(top);

  const tool = state.tool;
  // 排除自己与所有子孙分类：选中它们会把分类树接成环
  const blocked = new Set();

  if (draft.mid) {
    blocked.add(draft.mid);

    let changed = true;

    while (changed) {
      changed = false;

      tool.categories.forEach((item) => {
        if (!blocked.has(item.mid) && blocked.has(item.parent)) {
          blocked.add(item.mid);
          changed = true;
        }
      });
    }
  }

  tool.categories.forEach((item) => {
    if (blocked.has(item.mid)) {
      return;
    }

    const option = document.createElement('option');
    option.value = String(item.mid);
    option.textContent = item.name;
    option.selected = Number(draft.parent) === item.mid;
    select.appendChild(option);
  });

  wrap.append(label, select);
  return wrap;
}

function renderMeta(item) {
  const tool = state.tool;
  const isCategory = tool.status === 'category';
  const row = document.createElement('div');
  row.className = 'tool-item';

  const head = document.createElement('div');
  head.className = 'tool-head';

  const name = document.createElement('span');
  name.className = 'tool-author';
  name.textContent = item.name;

  const badge = document.createElement('span');
  badge.className = 'badge on';
  badge.textContent = `${item.count || 0} 篇`;

  const slug = document.createElement('span');
  slug.className = 'tool-time';
  slug.textContent = `/${item.slug}`;

  head.append(name, badge, slug);

  const meta = document.createElement('div');
  meta.className = 'tool-meta';

  if (isCategory) {
    const parent = tool.categories.find((category) => category.mid === Number(item.parent));
    meta.textContent = [
      parent ? `父分类：${parent.name}` : '顶级分类',
      item.description || '',
    ].filter(Boolean).join(' · ');
  }

  const actions = document.createElement('div');
  actions.className = 'tool-actions';

  actions.appendChild(toolButton('编辑', 'ghost', () => {
    tool.edit = {
      mid: item.mid,
      name: item.name,
      slug: item.slug,
      description: item.description || '',
      order: item.order || 0,
      parent: item.parent || 0,
    };
    renderToolItems();
  }));

  const remove = toolButton('删除', 'ghost');
  confirmThen(remove, '确认删除', () => {
    runToolAction('metaDelete', { mid: item.mid }, isCategory ? '分类已删除' : '标签已删除');
  });
  actions.appendChild(remove);

  row.append(head);

  if (meta.textContent) {
    row.appendChild(meta);
  }

  row.appendChild(actions);
  return row;
}

function renderComment(item) {
  const row = document.createElement('div');
  row.className = 'tool-item';

  const head = document.createElement('div');
  head.className = 'tool-head';

  const author = document.createElement('span');
  author.className = 'tool-author';
  author.textContent = item.author || '匿名';

  const status = COMMENT_STATUS[item.status] || { label: item.status, className: 'off' };
  const badge = document.createElement('span');
  badge.className = `badge ${status.className}`;
  badge.textContent = status.label;

  const time = document.createElement('span');
  time.className = 'tool-time';
  time.textContent = formatTime(item.created);

  head.append(author, badge, time);

  const title = document.createElement('div');
  title.className = 'tool-title';
  title.textContent = item.title ? `《${item.title}》` : '';

  const text = document.createElement('div');
  text.className = 'tool-text';
  text.textContent = item.text || '';

  const actions = document.createElement('div');
  actions.className = 'tool-actions';

  if (item.status !== 'approved') {
    actions.appendChild(toolButton('通过', 'ghost', () =>
      runToolAction('commentApprove', { coid: item.coid }, '评论已通过')));
  }

  if (item.status !== 'waiting') {
    actions.appendChild(toolButton('待审核', 'ghost', () =>
      runToolAction('commentWaiting', { coid: item.coid }, '已标记为待审核')));
  }

  if (item.status !== 'spam') {
    actions.appendChild(toolButton('垃圾', 'ghost', () =>
      runToolAction('commentSpam', { coid: item.coid }, '已标记为垃圾')));
  }

  const replyBox = document.createElement('div');
  replyBox.className = 'tool-reply';
  replyBox.hidden = true;

  const replyInput = document.createElement('textarea');
  replyInput.rows = 2;
  replyInput.placeholder = '以站长身份回复…';

  // 常用短语：点击填入、长按 600ms 删除；只存在本机，不上传服务端
  const phraseBar = document.createElement('div');
  phraseBar.className = 'reply-phrases';

  const phraseList = document.createElement('div');
  phraseList.className = 'reply-phrase-list';

  const phraseSave = document.createElement('button');
  phraseSave.type = 'button';
  phraseSave.className = 'reply-phrase-save';
  phraseSave.textContent = '存为短语';
  phraseSave.addEventListener('click', () => {
    if (!replyInput.value.trim()) {
      toast('先输入回复内容');
      return;
    }

    if (addReply(replyInput.value)) {
      toast('已存入常用短语');
      renderPhraseList();
    } else {
      toast('这句话已在短语库里');
    }
  });

  function renderPhraseList() {
    phraseList.innerHTML = '';

    listReplies().forEach((phrase) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'reply-phrase';
      chip.textContent = phrase.text;

      let pressTimer = 0;
      let longPressed = false;

      chip.addEventListener('pointerdown', () => {
        longPressed = false;
        pressTimer = window.setTimeout(() => {
          longPressed = true;
          removeReply(phrase.id);
          renderPhraseList();
          toast('已删除短语');
        }, 600);
      });

      ['pointerup', 'pointerleave', 'pointercancel'].forEach((type) => {
        chip.addEventListener(type, () => window.clearTimeout(pressTimer));
      });

      chip.addEventListener('click', () => {
        if (longPressed) {
          longPressed = false;
          return;
        }

        replyInput.value = phrase.text;
        replyInput.focus();
      });

      phraseList.appendChild(chip);
    });

    phraseList.hidden = phraseList.childElementCount === 0;
  }

  renderPhraseList();
  phraseBar.append(phraseList, phraseSave);

  const replySend = document.createElement('button');
  replySend.type = 'button';
  replySend.className = 'btn primary small';
  replySend.textContent = '发送回复';
  replySend.addEventListener('click', () => {
    const value = replyInput.value.trim();

    if (!value) {
      toast('回复内容不能为空');
      return;
    }

    runToolAction('commentReply', { coid: item.coid, text: value }, '回复已发送');
  });

  replyBox.append(phraseBar, replyInput, replySend);
  actions.appendChild(toolButton('回复', 'ghost', () => {
    replyBox.hidden = !replyBox.hidden;

    if (!replyBox.hidden) {
      replyInput.focus();
    }
  }));

  const remove = toolButton('删除', 'ghost');
  confirmThen(remove, '确认删除', () =>
    runToolAction('commentDelete', { coid: item.coid }, '评论已删除'));
  actions.appendChild(remove);

  row.append(head);

  if (item.title) {
    row.appendChild(title);
  }

  row.append(text, actions, replyBox);
  return row;
}

function renderMedia(item) {
  const row = document.createElement('div');
  row.className = 'tool-item media-item';

  const thumb = document.createElement('div');
  thumb.className = 'media-thumb';

  if (item.image && item.url) {
    const img = document.createElement('img');
    img.src = item.url;
    img.alt = item.name || '';
    img.loading = 'lazy';
    thumb.appendChild(img);
  } else {
    thumb.textContent = (item.type || 'file').toUpperCase();
  }

  const info = document.createElement('div');
  info.className = 'media-info';

  const title = document.createElement('div');
  title.className = 'tool-title';
  title.textContent = item.name || item.title || '未命名文件';

  const meta = document.createElement('div');
  meta.className = 'tool-meta';
  meta.textContent = [formatSize(item.size), formatTime(item.created)].filter(Boolean).join(' · ');

  const actions = document.createElement('div');
  actions.className = 'tool-actions';

  actions.appendChild(toolButton('复制链接', 'ghost', async () => {
    const ok = await copyText(item.url || '');
    toast(ok ? '链接已复制' : '复制失败，请长按图片保存');
  }));

  // 重命名：只改展示名，磁盘文件名与已插入正文的链接都不受影响
  let renaming = false;
  actions.appendChild(toolButton('重命名', 'ghost', () => {
    if (renaming) {
      return;
    }

    renaming = true;

    const box = document.createElement('div');
    box.className = 'media-rename';

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 120;
    input.value = item.name || item.title || '';

    const buttons = document.createElement('div');
    buttons.className = 'media-rename-actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn ghost small';
    cancel.textContent = '取消';

    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn primary small';
    save.textContent = '保存';

    buttons.append(cancel, save);
    box.append(input, buttons);
    info.appendChild(box);
    input.focus();
    input.select();

    cancel.addEventListener('click', () => {
      box.remove();
      renaming = false;
    });

    save.addEventListener('click', async () => {
      const value = input.value.trim();

      if (!value) {
        toast('名称不能为空');
        return;
      }

      save.disabled = true;
      save.textContent = '保存中…';

      try {
        await callAdmin('mediaRename', { method: 'POST', body: { cid: item.cid, name: value } });
        item.name = value;
        title.textContent = value;
        box.remove();
        renaming = false;
        toast('已重命名');
      } catch (error) {
        toast(error.message);
        save.disabled = false;
        save.textContent = '保存';
      }
    });
  }));

  const remove = toolButton('删除', 'ghost');
  confirmThen(remove, '确认删除', () =>
    runToolAction('mediaDelete', { cid: item.cid }, '文件已删除'));
  actions.appendChild(remove);

  info.append(title, meta, actions);
  row.append(thumb, info);
  return row;
}

function toolButton(label, variant, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `btn ${variant} small`;
  button.textContent = label;

  if (typeof handler === 'function') {
    button.addEventListener('click', handler);
  }

  return button;
}

/**
 * 两步确认：第一次点击进入确认态，4 秒内再次点击才执行
 */
function confirmThen(button, label, action) {
  const original = button.textContent;
  let timer = 0;

  button.addEventListener('click', () => {
    if (button.dataset.armed === '1') {
      window.clearTimeout(timer);
      button.dataset.armed = '';
      button.textContent = original;
      button.classList.remove('warn');
      action();
      return;
    }

    button.dataset.armed = '1';
    button.textContent = label;
    button.classList.add('warn');

    timer = window.setTimeout(() => {
      button.dataset.armed = '';
      button.textContent = original;
      button.classList.remove('warn');
    }, 4000);
  });
}

async function runToolAction(action, body, message) {
  const tool = state.tool;

  if (!tool || tool.busy) {
    return;
  }

  tool.busy = true;

  try {
    await callAdmin(action, { method: 'POST', body });
    toast(message);
    tool.busy = false;
    await reloadTool();
  } catch (error) {
    toast(error.message);
    tool.busy = false;
  }
}

async function reloadTool() {
  const tool = state.tool;

  if (!tool) {
    return;
  }

  tool.page = 1;
  await loadToolPage(true);
  refreshOverview();
}

async function refreshOverview() {
  try {
    const data = await callAdmin('overview');
    state.overview = data || {};
    renderStats(state.overview);
    renderContent();
  } catch (error) {
    // 概览刷新失败不影响列表操作
  }
}

function formatTime(ts) {
  if (!ts) {
    return '';
  }

  const date = new Date(Number(ts) * 1000);
  const pad = (value) => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatSize(bytes) {
  const size = Number(bytes || 0);

  if (size <= 0) {
    return '';
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

async function copyText(text) {
  if (!text) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();

    try {
      return document.execCommand('copy');
    } catch (fallbackError) {
      return false;
    } finally {
      area.remove();
    }
  }
}

// ─── 插件列表 ────────────────────────────────────────────────────────────

function renderPlugins() {
  el.plugins.innerHTML = '';

  if (!state.plugins.length) {
    const empty = document.createElement('p');
    empty.className = 'plugin-empty';
    empty.textContent = '没有找到插件';
    el.plugins.appendChild(empty);
    return;
  }

  state.plugins.forEach((plugin) => {
    const row = document.createElement('div');
    row.className = 'plugin-item';

    const info = document.createElement('div');
    info.className = 'plugin-info';

    const title = document.createElement('div');
    title.className = 'plugin-title';
    title.textContent = plugin.title || plugin.name;

    const meta = document.createElement('div');
    meta.className = 'plugin-meta';

    const badge = document.createElement('span');
    badge.className = `badge ${plugin.active ? 'on' : 'off'}`;
    badge.textContent = plugin.active ? '已启用' : '未启用';
    meta.appendChild(badge);

    if (plugin.version) {
      const version = document.createElement('span');
      version.textContent = `v${plugin.version}`;
      meta.appendChild(version);
    }

    if (plugin.author) {
      const author = document.createElement('span');
      author.textContent = plugin.author;
      meta.appendChild(author);
    }

    info.append(title, meta);

    const actions = document.createElement('div');
    actions.className = 'plugin-actions';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn ghost small';

    if (plugin.active) {
      const confirming = state.pendingOff === plugin.name;
      toggle.textContent = confirming ? '确认停用' : '停用';
      toggle.className = `btn ${confirming ? 'warn' : 'ghost'} small`;
      toggle.disabled = Boolean(plugin.self);
      toggle.title = plugin.self ? '接口插件不能停用' : '停用后配置会保留';

      if (!plugin.self) {
        toggle.addEventListener('click', () => handleToggle(plugin, false));
      }
    } else {
      toggle.textContent = '启用';
      toggle.addEventListener('click', () => handleToggle(plugin, true));
    }

    const config = document.createElement('button');
    config.type = 'button';
    config.className = 'btn ghost small';
    config.textContent = '配置';
    config.disabled = !plugin.active || !plugin.hasConfig;
    config.title = !plugin.active
      ? '插件未启用，暂不支持配置'
      : plugin.hasConfig
        ? ''
        : '该插件没有配置表单';
    config.addEventListener('click', () =>
      openPanel({ kind: 'plugin', name: plugin.name, title: plugin.title || plugin.name }),
    );

    actions.append(toggle, config);
    row.append(info, actions);
    el.plugins.appendChild(row);
  });
}

/**
 * 启用/停用插件
 *
 * 停用是两步操作：第一次点击进入确认态，5 秒内再次点击才真正执行。
 *
 * @param {object} plugin 插件信息
 * @param {boolean} active 目标状态
 */
async function handleToggle(plugin, active) {
  if (state.busy) {
    return;
  }

  if (active) {
    await runPluginAction('activatePlugin', plugin.name, '插件已启用');
    return;
  }

  if (state.pendingOff !== plugin.name) {
    setPendingOff(plugin.name);
    toast('再次点击「确认停用」以停用插件，配置会保留');
    return;
  }

  clearPendingOff();
  await runPluginAction('deactivatePlugin', plugin.name, '插件已停用，配置已保留');
}

async function runPluginAction(action, name, message) {
  state.busy = true;

  try {
    await callAdmin(action, { method: 'POST', body: { name } });
    toast(message);
  } catch (error) {
    toast(error.message);
    state.busy = false;
    renderPlugins();
    return;
  }

  state.busy = false;
  await load();
}

function setPendingOff(name) {
  clearPendingOff();
  state.pendingOff = name;
  state.pendingTimer = window.setTimeout(() => {
    state.pendingOff = '';
    state.pendingTimer = 0;
    renderPlugins();
  }, 5000);
  renderPlugins();
}

function clearPendingOff() {
  if (state.pendingTimer) {
    window.clearTimeout(state.pendingTimer);
  }

  state.pendingOff = '';
  state.pendingTimer = 0;
}

// ─── 配置面板 ────────────────────────────────────────────────────────────

async function openPanel(panel) {
  if (state.busy || !panel) {
    return;
  }

  state.busy = true;
  el.error.hidden = true;
  el.loading.hidden = false;
  el.loading.textContent = '读取配置…';

  try {
    let data;

    if (panel.kind === 'plugin') {
      data = await callAdmin('pluginConfig', { query: { name: panel.name } });
    } else if (panel.kind === 'site') {
      data = await callAdmin('siteConfig', { query: { group: panel.group } });
    } else {
      data = await callAdmin('themeConfig');
    }

    // 请求期间用户已经切到评论 / 媒体等工具页：丢弃这次配置结果，
    // 否则配置面板与工具面板会叠在一起，返回键也要按两次
    if (state.tool) {
      return;
    }

    state.panel = { ...panel, title: data?.title || panel.title };
    el.configTitle.textContent = state.panel.title;
    renderFields(Array.isArray(data?.fields) ? data.fields : []);
    el.overview.hidden = true;
    el.tools.hidden = true;
    el.config.hidden = false;
    el.body.scrollTop = 0;
  } catch (error) {
    if (state.tool) {
      return;
    }

    showError(error.message);
  } finally {
    state.busy = false;
    el.loading.hidden = true;
  }
}

async function savePanel() {
  if (!state.panel || state.busy) {
    return;
  }

  const { kind, name, group } = state.panel;
  const values = collectValues();

  let action;
  let body;

  if (kind === 'plugin') {
    action = 'savePluginConfig';
    body = { name, values };
  } else if (kind === 'site') {
    action = 'saveSiteConfig';
    body = { group, values };
  } else {
    action = 'saveThemeConfig';
    body = { values };
  }

  state.busy = true;
  const original = el.save.textContent;
  el.save.disabled = true;
  el.save.textContent = '保存中…';

  try {
    const data = await callAdmin(action, { method: 'POST', body });

    if (Array.isArray(data?.fields)) {
      renderFields(data.fields);
    }

    toast('已保存');
  } catch (error) {
    toast(error.message);
  } finally {
    state.busy = false;
    el.save.disabled = false;
    el.save.textContent = original;
  }
}

// ─── 表单渲染 ────────────────────────────────────────────────────────────

function renderFields(fields) {
  el.configBody.innerHTML = '';

  if (!fields.length) {
    const empty = document.createElement('p');
    empty.className = 'plugin-empty';
    empty.textContent = '没有可编辑的配置项';
    el.configBody.appendChild(empty);
    return;
  }

  fields.forEach((field) => {
    el.configBody.appendChild(renderField(field));
  });
}

function renderField(field) {
  const wrap = document.createElement('div');
  wrap.className = 'field';

  const label = document.createElement('span');
  label.className = 'field-label';
  label.textContent = field.label || field.name;
  wrap.appendChild(label);

  if (field.type === 'hidden') {
    const input = createInput(field, 'hidden');
    input.hidden = true;
    wrap.appendChild(input);
    wrap.hidden = true;
    return wrap;
  }

  if (field.type === 'select') {
    const select = document.createElement('select');
    select.dataset.field = field.name;

    (field.options || []).forEach((option) => {
      const node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.label || option.value;
      node.selected = Boolean(option.checked) || String(option.value) === String(field.value);
      select.appendChild(node);
    });

    wrap.appendChild(select);
  } else if (field.type === 'radio' || field.type === 'checkbox') {
    const group = document.createElement('div');
    group.className = 'choice-group';

    (field.options || []).forEach((option) => {
      const item = document.createElement('label');
      item.className = 'choice-item';

      const input = document.createElement('input');
      input.type = field.type;
      input.dataset.field = field.name;
      input.value = option.value;
      input.checked = Boolean(option.checked);

      item.append(input, document.createTextNode(option.label || option.value));
      group.appendChild(item);
    });

    wrap.appendChild(group);
  } else if (field.type === 'textarea') {
    const textarea = document.createElement('textarea');
    textarea.rows = 3;
    textarea.dataset.field = field.name;
    textarea.value = field.value ?? '';
    wrap.appendChild(textarea);
  } else {
    wrap.appendChild(createInput(field, field.type));
  }

  if (field.description) {
    const desc = document.createElement('p');
    desc.className = 'field-desc';
    desc.textContent = field.description;
    wrap.appendChild(desc);
  }

  return wrap;
}

function createInput(field, type) {
  const input = document.createElement('input');
  input.type = type === 'text' ? 'text' : type;
  input.dataset.field = field.name;
  input.value = field.value ?? '';
  input.autocomplete = 'off';
  return input;
}

/**
 * 按 data-field 收集表单值
 *
 * 复选框组收集为数组，单选/文本取最后出现的值。
 */
function collectValues() {
  const values = {};
  const nodes = el.configBody.querySelectorAll('[data-field]');

  nodes.forEach((node) => {
    const key = node.dataset.field;

    if (node.type === 'checkbox') {
      if (!Array.isArray(values[key])) {
        values[key] = [];
      }

      if (node.checked) {
        values[key].push(node.value);
      }

      return;
    }

    if (node.type === 'radio') {
      if (node.checked) {
        values[key] = node.value;
      }

      return;
    }

    values[key] = node.value;
  });

  return values;
}
