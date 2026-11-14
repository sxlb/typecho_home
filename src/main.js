import './ui.css';
import { call, uploadImage, getSettings, saveSettings, isConfigured, DEFAULT_SETTINGS } from './api.js';
import { initEditor, getEditorValue, setEditorValue, destroyEditor, closeEditorSheets } from './editor.js';
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

const $ = (selector) => document.querySelector(selector);

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
const RELEASE_API = 'https://api.github.com/repos/sxlb/typecho_home/releases/tags/latest';
const DOWNLOAD_URL = 'https://github.com/sxlb/typecho_home/releases/latest/download/sxlb-writer.apk';

const el = {
  views: {
    list: $('#view-list'),
    editor: $('#view-editor'),
    settings: $('#view-settings'),
  },
  listLoading: $('#list-loading'),
  listEmpty: $('#list-empty'),
  listItems: $('#list-items'),
  listSearch: $('#list-search'),
  listFilters: $('#list-filters'),
  title: $('#post-title'),
  editorStatus: $('#editor-status'),
  sheet: $('#sheet'),
  sheetMask: $('#sheet-mask'),
  categoryChips: $('#category-chips'),
  tagChips: $('#tag-chips'),
  tags: $('#publish-tags'),
  summary: $('#publish-summary'),
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
    theme: $('#set-theme'),
  },
};

const state = {
  view: 'list',
  cid: 0,
  draftKey: '',
  status: 'draft',
  dirty: false,
  metasLoaded: false,
  categories: [],
  tags: [],
  selectedMids: new Set(),
  selectedTagNames: new Set(),
  autosaveTimer: null,
  toastTimer: null,
  posts: [],
  filter: 'all',
  query: '',
  update: null,
  item: null,
  allowWarnings: false,
  checkDraft: true,
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
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#161514' : '#f6f5f2');
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

async function loadPosts() {
  if (!isConfigured()) {
    openSettings();
    return;
  }

  el.listLoading.hidden = true;

  try {
    const data = await call('posts', { query: { page: 1, size: 50 } });
    state.posts = data.items || [];
    renderList();
  } catch (error) {
    toast(error.message);
    state.posts = [];
    renderList();
    el.listLoading.hidden = false;
    el.listLoading.textContent = '加载失败，下拉重试';
  }
}

function localDraftItems() {
  return listDrafts().filter((draft) => String(draft.id).startsWith('draft-'));
}

function renderList() {
  const keyword = state.query.trim().toLowerCase();
  const { filter } = state;

  const serverItems = state.posts.filter((item) => {
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

  const showLocal = filter === 'all' || filter === 'local' || filter === 'draft';
  const drafts = showLocal
    ? localDraftItems().filter(
        (draft) => !keyword || String(draft.title || '').toLowerCase().includes(keyword),
      )
    : [];

  el.listItems.innerHTML = '';
  el.listEmpty.hidden = drafts.length + serverItems.length > 0;

  if (!drafts.length && !serverItems.length) {
    el.listEmpty.hidden = false;
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
    const badge = item.scheduled
      ? '<span class="badge scheduled">定时</span>'
      : item.status === 'draft'
        ? '<span class="badge draft">草稿</span>'
        : '<span class="badge">已发布</span>';

    fragment.appendChild(
      createItem({
        key: `post-${item.cid}`,
        title: item.title || '未命名文档',
        badge,
        time: formatDate(item.created),
        item: { local: false, ...item },
      }),
    );
  });

  el.listItems.appendChild(fragment);
  el.listLoading.hidden = true;
}

function createItem({ title, badge, time, item }) {
  const wrap = document.createElement('div');
  wrap.className = 'post-item';

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'post-main';
  main.innerHTML = '<div class="post-title"></div><div class="post-meta"></div>';
  main.querySelector('.post-title').textContent = title;
  main.querySelector('.post-meta').innerHTML = `${badge}<span>${time}</span>`;
  main.addEventListener('click', () => {
    if (item.local) {
      openLocalDraft(item.id);
    } else {
      openPost(item.cid);
    }
  });

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
  wrap.appendChild(more);

  return wrap;
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
      openLocalDraft(item.id);
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
        renderList();
        toast('已删除本地草稿');
      },
      true,
    );
  } else {
    addItemAction('打开', () => {
      closeItemSheet();
      openPost(item.cid);
    });

    addItemAction(item.slug ? '复制文章链接' : '复制文章 ID', async () => {
      const settings = getSettings();
      const text = item.slug
        ? `${settings.server.replace(/\/+$/, '')}/${item.slug}`
        : String(item.cid);
      await copyText(text);
      closeItemSheet();
      toast('已复制');
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
  el.thumb.value = data.thumb || '';
  el.reprint.value = data.reprint || 'standard';
  el.slug.value = data.slug || '';
  el.created.value = '';

  const mids = Array.isArray(data.mid) ? data.mid.map(Number) : [];
  state.selectedMids = new Set(mids);
  renderCategoryChips();
}

function currentFields() {
  return {
    summary: el.summary.value.trim(),
    customSummary: el.summary.value.trim(),
    thumb: el.thumb.value.trim(),
    reprint: el.reprint.value,
  };
}

async function ensureMetas() {
  if (state.metasLoaded) {
    renderCategoryChips();
    renderTagChips();
    return;
  }

  try {
    const data = await call('metas');
    state.categories = data.categories || [];
    state.tags = data.tags || [];
    state.metasLoaded = true;
    renderCategoryChips();
    renderTagChips();
  } catch (error) {
    toast(`分类加载失败：${error.message}`);
  }
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
      refreshCheck();
    });
    el.categoryChips.appendChild(chip);
  }
}

function startEditor({ cid, draftKey, title, text, meta }) {
  state.cid = cid;
  state.draftKey = draftKey;
  state.dirty = false;
  el.title.value = title || '';
  fillSheet(meta || {});
  el.editorStatus.textContent = cid ? '已加载' : '新文章';

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

  writeDraft(state.draftKey, {
    cid: state.cid,
    title: el.title.value,
    text: getEditorValue(),
    mid: [...state.selectedMids],
    tags: collectTags().join(','),
    summary: el.summary.value,
    thumb: el.thumb.value,
    reprint: el.reprint.value,
    slug: el.slug.value,
    created: el.created.value,
  });
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

async function openPost(cid) {
  try {
    const post = await call('post', { query: { cid } });
    const local = readDraft(String(cid));
    const useLocal = local && local.updatedAt > post.modified * 1000;
    const source = useLocal ? local : {};

    state.status = post.status;
    state.selectedMids = new Set(source.mid || post.categories || []);

    startEditor({
      cid: post.cid,
      draftKey: String(post.cid),
      title: source.title ?? post.title,
      text: source.text ?? post.text,
      meta: {
        tags: source.tags ?? post.tags,
        summary: source.summary ?? post.fields?.summary ?? '',
        thumb: source.thumb ?? post.fields?.thumb ?? '',
        reprint: source.reprint ?? post.fields?.reprint ?? 'standard',
        slug: source.slug ?? post.slug,
        mid: [...state.selectedMids],
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

  destroyEditor();
  clearTimeout(state.autosaveTimer);
  state.dirty = false;
  state.draftKey = '';
  show('list');
  renderList();
  loadPosts();
}

// ─── 抽屉通用 ────────────────────────────────────────────────────────────

function showSheet(sheet, mask) {
  sheet.hidden = false;
  mask.hidden = false;
  requestAnimationFrame(() => {
    sheet.classList.add('open');
    mask.classList.add('open');
  });
}

function hideSheet(sheet, mask) {
  sheet.classList.remove('open');
  mask.classList.remove('open');
  setTimeout(() => {
    sheet.hidden = true;
    mask.hidden = true;
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
    show('list');
    await loadPosts();

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
  el.settings.theme.value = settings.theme || DEFAULT_SETTINGS.theme;
  renderVersion();
  show('settings');
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
    theme: el.settings.theme.value || DEFAULT_SETTINGS.theme,
  });
  applyTheme();
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
  } catch {
    if (manual) {
      toast('检查更新失败，请稍后再试');
    }
  } finally {
    clearTimeout(timer);
    localStorage.setItem('sxlb.updateCheck', String(Date.now()));
  }
}

// ─── 事件绑定 ────────────────────────────────────────────────────────────

function bind() {
  $('#btn-refresh').addEventListener('click', loadPosts);
  $('#btn-settings').addEventListener('click', openSettings);
  $('#btn-new').addEventListener('click', openNew);
  $('#btn-back').addEventListener('click', backToList);
  $('#btn-save').addEventListener('click', () => submit(state.status === 'draft'));
  $('#btn-publish').addEventListener('click', openSheet);
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
  });

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
  let touchStartY = 0;
  $('#list-body').addEventListener('touchstart', (event) => {
    touchStartY = event.touches[0].clientY;
  });
  $('#list-body').addEventListener('touchend', (event) => {
    const delta = event.changedTouches[0].clientY - touchStartY;
    if (delta > 90 && $('#list-body').scrollTop === 0) {
      loadPosts();
    }
  });

  // 安卓物理返回键
  if (window.Capacitor?.isNativePlatform?.()) {
    App.addListener('backButton', () => {
      if (!el.dialog.hidden) {
        $('#dialog-cancel').click();
      } else if (closeEditorSheets()) {
        // 编辑器内的主题 / 表格面板已关闭
      } else if (!el.itemSheet.hidden) {
        closeItemSheet();
      } else if (!el.historySheet.hidden) {
        hideSheet(el.historySheet, el.historyMask);
      } else if (!el.sheet.hidden) {
        closeSheet();
      } else if (state.view === 'editor') {
        backToList();
      } else if (state.view === 'settings') {
        isConfigured() ? show('list') : App.exitApp();
      } else {
        App.exitApp();
      }
    });
  }
}

applyTheme();

// 跟随系统时，系统在深浅色之间切换要立即生效
themeQuery?.addEventListener?.('change', () => {
  if ((getSettings().theme || DEFAULT_SETTINGS.theme) === 'auto') {
    applyTheme('auto');
  }
});

migrateLegacyDraft();
bind();

if (isConfigured()) {
  loadPosts();

  const lastCheck = Number(localStorage.getItem('sxlb.updateCheck') || 0);
  if (Date.now() - lastCheck > 24 * 3600 * 1000) {
    checkUpdate(false);
  }
} else {
  openSettings();
}
