/**
 * 管理页：站点概览、插件列表、插件配置
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
  plugins: $('#admin-plugins'),
  config: $('#admin-config'),
  configTitle: $('#admin-config-title'),
  configBody: $('#admin-config-body'),
  save: $('#btn-admin-config-save'),
};

const state = {
  current: '',
  loaded: false,
  busy: false,
};

let toast = () => {};

export function initAdmin(options = {}) {
  toast = typeof options.onToast === 'function' ? options.onToast : toast;

  $('#btn-admin-refresh').addEventListener('click', () => load());
  $('#btn-admin-retry').addEventListener('click', () => load());
  $('#btn-admin-config-back').addEventListener('click', showList);
  el.save.addEventListener('click', saveConfig);
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
 * 物理返回键：配置面板打开时先回插件列表
 *
 * @returns {boolean} 是否已消费返回事件
 */
export function handleAdminBack() {
  if (state.current) {
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
  el.error.hidden = true;
  el.overview.hidden = true;
  el.config.hidden = true;
  el.loading.hidden = false;
  el.loading.textContent = '加载中…';

  try {
    const [overview, plugins] = await Promise.all([callAdmin('overview'), callAdmin('plugins')]);

    renderStats(overview || {});
    renderPlugins(Array.isArray(plugins?.items) ? plugins.items : []);
    state.loaded = true;
    el.overview.hidden = false;
  } catch (error) {
    showError(error.message);
  } finally {
    state.busy = false;
    el.loading.hidden = true;
  }
}

async function openConfig(name) {
  if (state.busy || !name) {
    return;
  }

  state.busy = true;
  el.error.hidden = true;
  el.loading.hidden = false;
  el.loading.textContent = '读取配置…';

  try {
    const data = await callAdmin('pluginConfig', { query: { name } });

    state.current = name;
    el.configTitle.textContent = data.title || name;
    renderFields(Array.isArray(data.fields) ? data.fields : []);
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

function showList() {
  state.current = '';
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

// ─── 插件列表 ────────────────────────────────────────────────────────────

function renderPlugins(items) {
  el.plugins.innerHTML = '';

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'plugin-empty';
    empty.textContent = '没有找到插件';
    el.plugins.appendChild(empty);
    return;
  }

  items.forEach((plugin) => {
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

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn ghost small';
    button.textContent = '配置';
    button.disabled = !plugin.active || !plugin.hasConfig;
    button.title = !plugin.active
      ? '插件未启用，暂不支持配置'
      : plugin.hasConfig
        ? ''
        : '该插件没有配置表单';
    button.addEventListener('click', () => openConfig(plugin.name));

    row.append(info, button);
    el.plugins.appendChild(row);
  });
}

// ─── 配置表单 ────────────────────────────────────────────────────────────

function renderFields(fields) {
  el.configBody.innerHTML = '';

  if (!fields.length) {
    const empty = document.createElement('p');
    empty.className = 'plugin-empty';
    empty.textContent = '该插件没有可编辑的配置项';
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

async function saveConfig() {
  if (!state.current || state.busy) {
    return;
  }

  state.busy = true;
  const original = el.save.textContent;
  el.save.disabled = true;
  el.save.textContent = '保存中…';

  try {
    const data = await callAdmin('savePluginConfig', {
      method: 'POST',
      body: { name: state.current, values: collectValues() },
    });

    if (Array.isArray(data?.fields)) {
      renderFields(data.fields);
    }

    toast('配置已保存');
  } catch (error) {
    toast(error.message);
  } finally {
    state.busy = false;
    el.save.disabled = false;
    el.save.textContent = original;
  }
}
