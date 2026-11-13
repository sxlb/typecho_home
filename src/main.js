import './ui.css';
import { call, uploadImage, getSettings, saveSettings, isConfigured, DEFAULT_SETTINGS } from './api.js';
import { initEditor, getEditorValue, destroyEditor } from './editor.js';
import { App } from '@capacitor/app';

const $ = (selector) => document.querySelector(selector);

const el = {
  views: {
    list: $('#view-list'),
    editor: $('#view-editor'),
    settings: $('#view-settings'),
  },
  listLoading: $('#list-loading'),
  listEmpty: $('#list-empty'),
  listItems: $('#list-items'),
  title: $('#post-title'),
  editorStatus: $('#editor-status'),
  sheet: $('#sheet'),
  sheetMask: $('#sheet-mask'),
  categoryChips: $('#category-chips'),
  tags: $('#publish-tags'),
  summary: $('#publish-summary'),
  thumb: $('#publish-thumb'),
  reprint: $('#publish-reprint'),
  created: $('#publish-created'),
  slug: $('#publish-slug'),
  toast: $('#toast'),
  settings: {
    server: $('#set-server'),
    token: $('#set-token'),
    secret: $('#set-secret'),
  },
};

const state = {
  view: 'list',
  cid: 0,
  status: 'draft',
  dirty: false,
  metasLoaded: false,
  categories: [],
  selectedMids: new Set(),
  autosaveTimer: null,
  toastTimer: null,
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

function localKey(cid = state.cid) {
  return `sxlb.local.${cid || 'new'}`;
}

function readLocal(cid) {
  try {
    return JSON.parse(localStorage.getItem(localKey(cid)) || 'null');
  } catch {
    return null;
  }
}

function writeLocal(data) {
  localStorage.setItem(localKey(), JSON.stringify({ ...data, updatedAt: Date.now() }));
}

function clearLocal(cid = state.cid) {
  localStorage.removeItem(localKey(cid));
}

// ─── 列表 ────────────────────────────────────────────────────────────────

async function loadPosts() {
  if (!isConfigured()) {
    openSettings();
    return;
  }

  el.listLoading.hidden = false;
  el.listEmpty.hidden = true;
  el.listItems.innerHTML = '';

  try {
    const data = await call('posts', { query: { page: 1, size: 30 } });
    renderPosts(data.items);
  } catch (error) {
    toast(error.message);
    el.listLoading.textContent = '加载失败，下拉重试';
  } finally {
    el.listLoading.hidden = el.listItems.childElementCount > 0;
  }
}

function renderPosts(items) {
  el.listItems.innerHTML = '';
  el.listEmpty.hidden = items.length > 0;

  if (!items.length) {
    el.listLoading.hidden = true;
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const button = document.createElement('button');
    button.className = 'post-item';
    button.type = 'button';

    const badge = item.scheduled
      ? '<span class="badge scheduled">定时</span>'
      : item.status === 'draft'
        ? '<span class="badge draft">草稿</span>'
        : '<span class="badge">已发布</span>';

    button.innerHTML = `
      <div class="post-title"></div>
      <div class="post-meta">${badge}<span>${formatDate(item.created)}</span></div>
    `;
    button.querySelector('.post-title').textContent = item.title || '未命名文档';
    button.addEventListener('click', () => openPost(item.cid));

    fragment.appendChild(button);
  }

  el.listItems.appendChild(fragment);
}

// ─── 编辑 ────────────────────────────────────────────────────────────────

function fillSheet(data) {
  el.tags.value = data.tags || '';
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
    return;
  }

  try {
    const data = await call('metas', { query: { type: 'category' } });
    state.categories = data.categories || [];
    state.metasLoaded = true;
    renderCategoryChips();
  } catch (error) {
    toast(`分类加载失败：${error.message}`);
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
    });
    el.categoryChips.appendChild(chip);
  }
}

function startEditor({ cid, title, text, meta }) {
  state.cid = cid;
  state.dirty = false;
  el.title.value = title || '';
  fillSheet(meta || {});
  el.editorStatus.textContent = cid ? '已加载' : '新文章';

  show('editor');

  initEditor({
    value: text || '',
    onChange: () => {
      state.dirty = true;
      el.editorStatus.textContent = '编辑中…';
      scheduleAutosave();
    },
    getCid: () => state.cid,
    onError: (message) => toast(message),
  });
}

function scheduleAutosave() {
  clearTimeout(state.autosaveTimer);
  state.autosaveTimer = setTimeout(() => {
    persistLocal();
    const now = new Date();
    el.editorStatus.textContent = `已存本地 ${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes(),
    ).padStart(2, '0')}`;
  }, 1200);
}

function persistLocal() {
  writeLocal({
    title: el.title.value,
    text: getEditorValue(),
    mid: [...state.selectedMids],
    tags: el.tags.value,
    summary: el.summary.value,
    thumb: el.thumb.value,
    reprint: el.reprint.value,
    slug: el.slug.value,
    created: el.created.value,
  });
}

function openNew() {
  const local = readLocal(0);

  state.status = 'draft';

  startEditor({
    cid: 0,
    title: local?.title || '',
    text: local?.text || '',
    meta: local || {},
  });

  if (local) {
    toast('已恢复本地草稿');
  }
}

async function openPost(cid) {
  try {
    const post = await call('post', { query: { cid } });
    const local = readLocal(cid);
    const useLocal = local && local.updatedAt > post.modified * 1000;
    const source = useLocal ? local : {};

    state.status = post.status;
    state.selectedMids = new Set(source.mid || post.categories || []);

    startEditor({
      cid: post.cid,
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
  // 输入后 1.2 秒内返回时防抖计时器会被清掉，这里补一次落盘，避免丢内容
  if (state.dirty) {
    persistLocal();
  }

  destroyEditor();
  clearTimeout(state.autosaveTimer);
  state.dirty = false;
  show('list');
  loadPosts();
}

// ─── 发布抽屉 ────────────────────────────────────────────────────────────

function openSheet() {
  ensureMetas();
  el.sheet.hidden = false;
  el.sheetMask.hidden = false;
  requestAnimationFrame(() => {
    el.sheet.classList.add('open');
    el.sheetMask.classList.add('open');
  });
}

function closeSheet() {
  el.sheet.classList.remove('open');
  el.sheetMask.classList.remove('open');
  setTimeout(() => {
    el.sheet.hidden = true;
    el.sheetMask.hidden = true;
  }, 260);
}

async function submit(isDraft) {
  const title = el.title.value.trim();

  if (!title) {
    toast('请先填写标题');
    return;
  }

  if (!getEditorValue().trim()) {
    toast('正文不能为空');
    return;
  }

  const body = {
    cid: state.cid,
    title,
    text: getEditorValue(),
    slug: el.slug.value.trim(),
    isDraft,
    mid: [...state.selectedMids],
    tags: el.tags.value.trim(),
    fields: currentFields(),
  };

  if (el.created.value) {
    body.created = Math.floor(new Date(el.created.value).getTime() / 1000);
  }

  const button = isDraft ? $('#btn-draft') : $('#btn-submit');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '提交中…';

  try {
    const result = await call('save', { method: 'POST', body });
    const previousCid = state.cid;

    state.cid = result.cid;
    state.status = result.status;
    state.dirty = false;
    clearLocal(0);
    clearLocal(previousCid);
    clearLocal(result.cid);

    closeSheet();
    destroyEditor();
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
  }
}

// ─── 设置 ────────────────────────────────────────────────────────────────

function openSettings() {
  const settings = getSettings();
  el.settings.server.value = settings.server || DEFAULT_SETTINGS.server;
  el.settings.token.value = settings.token || '';
  el.settings.secret.value = settings.secret || '';
  show('settings');
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
  });
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
    isConfigured() ? loadPosts() : show('settings');
  });

  el.title.addEventListener('input', () => {
    state.dirty = true;
    scheduleAutosave();
  });

  $('#btn-test').addEventListener('click', testConnection);
  $('#btn-save-settings').addEventListener('click', () => {
    saveSettingsFromForm();
    toast('设置已保存');
    loadPosts();
  });

  $('#sheet-close').addEventListener('click', closeSheet);
  el.sheetMask.addEventListener('click', closeSheet);
  $('#btn-draft').addEventListener('click', () => submit(true));
  $('#btn-submit').addEventListener('click', () => submit(false));

  $('#btn-thumb-upload').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.addEventListener('change', async () => {
      if (!input.files?.length) {
        return;
      }

      try {
        const result = await uploadImage(input.files[0], state.cid);
        el.thumb.value = result.url;
        toast('缩略图已上传');
      } catch (error) {
        toast(error.message);
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
      if (!el.sheet.hidden) {
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

bind();

if (isConfigured()) {
  loadPosts();
} else {
  openSettings();
}
