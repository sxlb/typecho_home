/**
 * 管理页：站点概览、插件启停、插件配置、站点设置、当前主题设置
 *
 * 接口统一走 callAdmin()，签名路径为 /writer-api/admin/{do}。
 * 这里只负责渲染与交互，鉴权、开关判断都在服务端完成。
 */

import { callAdmin } from './api.js';

const $ = (selector) => document.querySelector(selector);

const el = {
  body: $('#admin-body'),
  loading: $('#admin-loading'),
  error: $('#admin-error'),
  errorText: $('#admin-error-text'),
  overview: $('#admin-overview'),
  stats: $('#admin-stats'),
  entries: $('#admin-entries'),
  plugins: $('#admin-plugins'),
  config: $('#admin-config'),
  configTitle: $('#admin-config-title'),
  configBody: $('#admin-config-body'),
  save: $('#btn-admin-config-save'),
};

const state = {
  panel: null, // { kind: 'plugin' | 'site' | 'theme', name?, group?, title }
  plugins: [],
  siteGroups: [],
  loaded: false,
  busy: false,
  pendingOff: '',
  pendingTimer: 0,
};

let toast = () => {};

export function initAdmin(options = {}) {
  toast = typeof options.onToast === 'function' ? options.onToast : toast;

  $('#btn-admin-refresh').addEventListener('click', () => load());
  $('#btn-admin-retry').addEventListener('click', () => load());
  $('#btn-admin-config-back').addEventListener('click', showList);
  el.save.addEventListener('click', savePanel);
}

/**
 * 打开管理页并拉取数据
 */
export async function openAdmin() {
  if (state.busy) {
    return;
  }

  showList();
  await load();
}

/**
 * 物理返回键：配置面板打开时先回概览
 *
 * @returns {boolean} 是否已消费返回事件
 */
export function handleAdminBack() {
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

    renderStats(overview || {});
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
  clearPendingOff();
  el.config.hidden = true;
  el.error.hidden = true;
  el.loading.hidden = true;
  el.overview.hidden = !state.loaded;
}

function showError(message) {
  el.loading.hidden = true;
  el.overview.hidden = true;
  el.config.hidden = true;
  el.error.hidden = false;
  el.errorText.textContent = message || '请检查网络与服务端配置';
}

// ─── 概览 ────────────────────────────────────────────────────────────────

function renderStats(data) {
  const items = [
    { label: '已发布', value: data.posts },
    { label: '草稿', value: data.drafts },
    {
      label: '评论',
      value: data.comments,
      hint: data.pendingComments ? `${data.pendingComments} 条待审核` : '',
    },
    { label: '媒体', value: data.media },
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
      if (entry.key === 'theme') {
        openPanel({ kind: 'theme', title: '主题设置' });
      } else {
        openPanel({ kind: 'site', group: entry.key, title: entry.title });
      }
    });

    row.append(info, button);
    el.entries.appendChild(row);
  });
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

    state.panel = { ...panel, title: data?.title || panel.title };
    el.configTitle.textContent = state.panel.title;
    renderFields(Array.isArray(data?.fields) ? data.fields : []);
    el.overview.hidden = true;
    el.config.hidden = false;
    el.body.scrollTop = 0;
  } catch (error) {
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
