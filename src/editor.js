import Vditor from 'vditor';
import 'vditor/dist/index.css';
import { uploadImage } from './api.js';

let vditor = null;
let currentCid = 0;
let errorHandler = null;
let changeHandler = null;
let modeHandler = null;

/* ─── 通用输入弹窗 ──────────────────────────────────────── */

/**
 * 打开表单弹窗，返回各字段的值；用户取消时返回 null
 *
 * @param {{title: string, confirmText?: string, fields: Array<{key: string, label: string, type?: 'text'|'select'|'textarea', value?: string, placeholder?: string, options?: Array<{value: string, label: string}>}>}} config
 * @returns {Promise<Record<string, string> | null>}
 */
function openDialog({ title, confirmText = '插入', fields }) {
  return new Promise((resolve) => {
    const root = document.getElementById('dialog');

    if (!root) {
      resolve(null);
      return;
    }

    const titleEl = document.getElementById('dialog-title');
    const bodyEl = document.getElementById('dialog-body');
    const okBtn = document.getElementById('dialog-ok');
    const cancelBtn = document.getElementById('dialog-cancel');

    titleEl.textContent = title;
    okBtn.textContent = confirmText;
    bodyEl.innerHTML = '';

    const inputs = {};

    fields.forEach((field) => {
      const wrap = document.createElement('label');
      wrap.className = 'dialog-field';

      const label = document.createElement('span');
      label.className = 'field-label';
      label.textContent = field.label;
      wrap.appendChild(label);

      let el;

      if (field.type === 'select') {
        el = document.createElement('select');
        (field.options || []).forEach((option) => {
          const item = document.createElement('option');
          item.value = option.value;
          item.textContent = option.label;
          el.appendChild(item);
        });
      } else if (field.type === 'textarea') {
        el = document.createElement('textarea');
        el.rows = 3;
      } else {
        el = document.createElement('input');
        el.type = 'text';
      }

      el.value = field.value || '';

      if (field.placeholder) {
        el.placeholder = field.placeholder;
      }

      inputs[field.key] = el;
      wrap.appendChild(el);
      bodyEl.appendChild(wrap);
    });

    const close = (result) => {
      root.hidden = true;
      root.onclick = null;
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      resolve(result);
    };

    // 点击遮罩空白处等同取消
    root.onclick = (event) => {
      if (event.target === root) {
        close(null);
      }
    };

    okBtn.onclick = () => {
      const values = {};
      Object.entries(inputs).forEach(([key, el]) => {
        values[key] = el.value.trim();
      });
      close(values);
    };

    cancelBtn.onclick = () => close(null);

    root.hidden = false;

    const first = Object.values(inputs)[0];
    if (first) {
      setTimeout(() => first.focus(), 60);
    }
  });
}

function insert(text) {
  if (vditor && text) {
    vditor.insertValue(text);
  }
}

function selected(fallback) {
  const sel = vditor?.getSelection()?.trim();
  return sel || fallback;
}

/** 手工改完正文后同步给外部（自动保存 / 字数统计） */
function notifyChange() {
  if (changeHandler) {
    changeHandler(getEditorValue());
  }
}

/* ─── 主题内置元素（对齐 Handsome 后台编辑器） ───────────── */

async function insertImage() {
  const value = await openDialog({
    title: '插入图片',
    fields: [
      { key: 'url', label: '图片地址', placeholder: 'https://', value: 'https://' },
      { key: 'alt', label: '图片描述', placeholder: '可不填' },
    ],
  });

  if (!value || !value.url || value.url === 'https://') {
    return;
  }

  insert(`![${value.alt || '图片'}](${value.url})`);
}

async function insertColorWord() {
  const value = await openDialog({
    title: '插入彩色文字',
    fields: [
      { key: 'color', label: '文字颜色', value: '#1f6f5c', placeholder: '#1f6f5c / red' },
      { key: 'word', label: '文字内容', value: selected('这里编辑文字') },
    ],
  });

  if (!value || !value.word) {
    return;
  }

  insert(`[font color="${value.color || '#1f6f5c'}"]${value.word}[/font]`);
}

async function insertMusic() {
  const value = await openDialog({
    title: '插入音乐',
    fields: [
      {
        key: 'mode',
        label: '类型',
        type: 'select',
        options: [
          { value: 'song', label: '歌曲' },
          { value: 'playlist', label: '歌单' },
          { value: 'link', label: '直链 / 云解析地址' },
        ],
      },
      {
        key: 'media',
        label: '平台',
        type: 'select',
        options: [
          { value: 'netease', label: '网易云' },
          { value: 'tencent', label: 'QQ 音乐' },
        ],
      },
      { key: 'id', label: '歌曲 / 歌单 ID', placeholder: '例如 1824045033' },
    ],
  });

  if (!value || !value.id) {
    return;
  }

  if (value.mode === 'link') {
    insert(`[hplayer]${value.id}[/hplayer]`);
    return;
  }

  insert(`[hplayer media="${value.media}" id="${value.id}" type="${value.mode}" size="large" auto="false" /]`);
}

async function insertVideo() {
  const value = await openDialog({
    title: '插入视频',
    fields: [
      { key: 'url', label: '视频地址', placeholder: 'https://xxx.mp4' },
      { key: 'pic', label: '视频封面', placeholder: '可不填' },
    ],
  });

  if (!value || !value.url) {
    return;
  }

  if (value.pic) {
    insert(`[vplayer url="${value.url}" pic="${value.pic}" /]`);
  } else {
    insert(`[vplayer url="${value.url}" /]`);
  }
}

async function insertPost() {
  const value = await openDialog({
    title: '插入文章卡片',
    fields: [
      { key: 'cid', label: '文章 cid（必填）', placeholder: '例如 23' },
      { key: 'cover', label: '封面图（可不填）', placeholder: 'https://' },
      {
        key: 'size',
        label: '样式',
        type: 'select',
        options: [
          { value: '', label: '文章卡片' },
          { value: 'small', label: '小尺寸链接' },
        ],
      },
    ],
  });

  if (!value || !value.cid) {
    return;
  }

  insert(`[post cid="${value.cid}" cover="${value.cover}" size="${value.size}"/]`);
}

async function insertButton() {
  const value = await openDialog({
    title: '插入按钮',
    fields: [
      { key: 'text', label: '按钮文字', value: selected('点我') },
      { key: 'url', label: '按钮链接', placeholder: 'https://' },
      { key: 'icon', label: '按钮图标（可不填）', placeholder: '例如 iconfont icon-github' },
      {
        key: 'color',
        label: '颜色',
        type: 'select',
        options: [
          { value: 'light', label: '白色' },
          { value: 'info', label: '蓝色' },
          { value: 'dark', label: '深色' },
          { value: 'success', label: '绿色' },
          { value: 'black', label: '黑色' },
          { value: 'warning', label: '黄色' },
          { value: 'primary', label: '紫色' },
          { value: 'danger', label: '红色' },
        ],
      },
      {
        key: 'type',
        label: '形状',
        type: 'select',
        options: [
          { value: '', label: '矩形' },
          { value: 'round', label: '椭圆形' },
        ],
      },
    ],
  });

  if (!value || !value.text) {
    return;
  }

  insert(`[button color="${value.color}" icon="${value.icon}" url="${value.url}" type="${value.type}"]${value.text}[/button]`);
}

async function insertScode() {
  const value = await openDialog({
    title: '插入高亮引用',
    fields: [
      {
        key: 'type',
        label: '样式',
        type: 'select',
        options: [
          { value: 'share', label: '资料灰' },
          { value: 'yellow', label: '提示黄' },
          { value: 'red', label: '警告红' },
          { value: 'blue', label: '信息蓝' },
          { value: 'green', label: '推荐绿' },
        ],
      },
      {
        key: 'size',
        label: '大小',
        type: 'select',
        options: [
          { value: '', label: '默认（左侧有图标）' },
          { value: 'simple', label: '简洁（没有图标）' },
          { value: 'small', label: '小尺寸' },
        ],
      },
      { key: 'content', label: '内容', type: 'textarea', value: selected('这里编辑标签内容') },
    ],
  });

  if (!value || !value.content) {
    return;
  }

  insert(`[scode type="${value.type}" size="${value.size}"]${value.content}[/scode]`);
}

async function insertCollapse() {
  const value = await openDialog({
    title: '插入收缩框',
    fields: [
      { key: 'title', label: '标题', value: '点击展开' },
      {
        key: 'status',
        label: '默认状态',
        type: 'select',
        options: [
          { value: 'true', label: '展开' },
          { value: 'false', label: '收起' },
        ],
      },
      { key: 'content', label: '内容', type: 'textarea', value: selected('这里编辑收缩框内容') },
    ],
  });

  if (!value) {
    return;
  }

  insert(`[collapse status="${value.status}" title="${value.title}"]${value.content}[/collapse]`);
}

/* ─── 主题元素面板（替代 Vditor 子菜单，避免被工具栏裁剪） ── */

const THEME_ITEMS = [
  { glyph: '图', label: '图片', run: insertImage },
  { glyph: '乐', label: '音乐', run: insertMusic },
  { glyph: '影', label: '视频', run: insertVideo },
  {
    glyph: '册',
    label: '相册',
    run: () =>
      insert(
        '[album type="photos"]\n[这里插入图片，支持 markdown 或 html，可混排](https://)\n[/album]',
      ),
  },
  { glyph: '彩', label: '彩色文字', run: insertColorWord },
  { glyph: '引', label: '高亮引用', run: insertScode },
  { glyph: '折', label: '收缩框', run: insertCollapse },
  { glyph: '钮', label: '按钮', run: insertButton },
  {
    glyph: '页',
    label: '标签页',
    run: () =>
      insert(
        '[tabs]\n[tab name="标签页 1" active="true"]内容 1[/tab]\n[tab name="标签页 2"]内容 2[/tab]\n[/tabs]',
      ),
  },
  {
    glyph: '线',
    label: '时间线',
    run: () =>
      insert(
        '[timeline title="请输入标题" type="small"]\n[item date="2026-01-01"] 这里编辑事件内容 [/item]\n[/timeline]',
      ),
  },
  {
    glyph: '划',
    label: '计划表',
    run: () =>
      insert(
        '[goal title="小目标"]\n[item check="true"] 已完成的任务 [/item]\n[item progress="50%"] 进行中的任务 [/item]\n[/goal]',
      ),
  },
  {
    glyph: '列',
    label: '多列布局',
    run: () =>
      insert(
        '[column]\n[block] 普通的一列 [/block]\n[block size="20%"]该列宽度 20%[/block]\n[/column]',
      ),
  },
  { glyph: '卡', label: '文章卡片', run: insertPost },
  {
    glyph: '评',
    label: '评论可见',
    run: () => insert(`[hide]${selected('这里编辑隐藏文本（评论可见）')}[/hide]`),
  },
  {
    glyph: '登',
    label: '登录可见',
    run: () => insert(`[login]${selected('这里编辑隐藏文本（登录可见）')}[/login]`),
  },
];

const THEME_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" style="fill:none;stroke-width:1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>';

let themeGridReady = false;

/* ─── 底部抽屉通用逻辑 ─────────────────────────────────── */

function openSheet(sheetId, maskId) {
  const sheet = document.getElementById(sheetId);
  const mask = document.getElementById(maskId);

  if (!sheet || !mask) {
    return;
  }

  sheet.hidden = false;
  mask.hidden = false;

  requestAnimationFrame(() => {
    sheet.classList.add('open');
    mask.classList.add('open');
  });
}

function closeSheet(sheetId, maskId) {
  const sheet = document.getElementById(sheetId);
  const mask = document.getElementById(maskId);

  if (!sheet || sheet.hidden) {
    return false;
  }

  sheet.classList.remove('open');
  mask.classList.remove('open');

  setTimeout(() => {
    sheet.hidden = true;
    mask.hidden = true;
  }, 260);

  return true;
}

/**
 * 关闭编辑器里的底部面板
 *
 * @returns {boolean} 是否有面板被关闭（供安卓返回键判断）
 */
export function closeEditorSheets() {
  const theme = closeSheet('theme-sheet', 'theme-mask');
  const table = closeSheet('table-sheet', 'table-mask');

  return theme || table;
}

/* ─── 编辑模式即时切换（即时渲染 / 所见即所得 / 分屏预览） ── */

/**
 * 分屏预览是纯 markdown 源码，表格结构直接改文本即可，不需要结构面板
 *
 * @param {boolean} visible
 */
function setTableOpsVisible(visible) {
  const button = document.querySelector('#editor .vditor-toolbar [data-type="tableops"]');
  const item = button?.closest('.vditor-toolbar__item');

  if (item) {
    item.style.display = visible ? '' : 'none';
  }
}

// Vditor 自带的 edit-mode 面板切换后，同步记录模式（写回设置）并联动表格面板
// 用捕获阶段监听：Vditor 的 hint 按钮点击会阻止冒泡
document.addEventListener(
  'click',
  (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest('#editor .vditor-toolbar [data-mode]')
        : null;

    if (!button) {
      return;
    }

    const mode = button.getAttribute('data-mode');

    // 切换模式会重建 DOM，之前记下的表格与选区已失效
    activeTable = null;
    savedRange = null;
    setTableOpsVisible(mode !== 'sv');
    modeHandler?.(mode);
  },
  true,
);

function createCells(grid, items, onPick) {
  items.forEach((item) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'theme-cell';

    const glyph = document.createElement('span');
    glyph.className = 'theme-glyph';
    glyph.textContent = item.glyph;

    const label = document.createElement('span');
    label.textContent = item.label;
    label.className = 'theme-label';

    cell.append(glyph, label);
    cell.addEventListener('click', () => {
      onPick(item);
    });

    grid.appendChild(cell);
  });
}

/* ─── 主题元素面板 ─────────────────────────────────────── */

function ensureThemeGrid() {
  if (themeGridReady) {
    return;
  }

  const grid = document.getElementById('theme-grid');

  if (!grid) {
    return;
  }

  createCells(grid, THEME_ITEMS, (item) => {
    closeSheet('theme-sheet', 'theme-mask');
    item.run();
  });

  document.getElementById('theme-close')?.addEventListener('click', () => closeSheet('theme-sheet', 'theme-mask'));
  document.getElementById('theme-mask')?.addEventListener('click', () => closeSheet('theme-sheet', 'theme-mask'));

  themeGridReady = true;
}

function openThemeSheet() {
  ensureThemeGrid();
  openSheet('theme-sheet', 'theme-mask');
}

/* ─── 表格删除（插入沿用 Vditor 原生表格按钮） ─────────── */

function getEditorRoot() {
  return (
    document.querySelector('#editor .vditor-ir') ||
    document.querySelector('#editor .vditor-wysiwyg')
  );
}

let activeTable = null;
let savedRange = null;

function liveCell() {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const root = getEditorRoot();
  let node = selection.anchorNode;

  while (node && node !== root) {
    if (node.nodeType === 1 && (node.tagName === 'TD' || node.tagName === 'TH')) {
      return node;
    }
    node = node.parentNode;
  }

  return null;
}

// 记住光标最后停留的表格和选区：点工具栏/面板按钮时选区会丢，操作前要还原
document.addEventListener('selectionchange', () => {
  const cell = liveCell();

  if (cell) {
    activeTable = cell.closest('table');

    const selection = window.getSelection();

    if (selection && selection.rangeCount > 0) {
      savedRange = selection.getRangeAt(0).cloneRange();
    }
  }
});

function currentTable() {
  const cell = liveCell();

  if (cell) {
    activeTable = cell.closest('table');
    return activeTable;
  }

  return activeTable && activeTable.isConnected ? activeTable : null;
}

/**
 * 删除光标所在的整张表格。
 * 直接改 markdown 再回填，避免手工删 DOM 让 Vditor 内部状态和正文不一致。
 */
function deleteCurrentTable() {
  const table = currentTable();

  if (!table) {
    errorHandler?.('先把光标点进要删除的表格');
    return;
  }

  const tables = Array.from(
    document.querySelectorAll('#editor .vditor-ir table, #editor .vditor-wysiwyg table'),
  );
  const index = tables.indexOf(table);
  const lines = getEditorValue().split('\n');

  // 收集 markdown 里的表格块（连续以 | 开头的行），跳过代码块内的内容
  const blocks = [];
  let inFence = false;
  let start = -1;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();

    if (line.startsWith('```')) {
      inFence = !inFence;
      start = -1;
      continue;
    }

    if (!inFence && line.startsWith('|')) {
      if (start < 0) {
        start = i;
      }
    } else if (start >= 0) {
      blocks.push([start, i - 1]);
      start = -1;
    }
  }

  if (start >= 0) {
    blocks.push([start, lines.length - 1]);
  }

  if (index < 0 || index >= blocks.length) {
    errorHandler?.('没定位到表格，请重新点一下表格再删');
    return;
  }

  const [from, to] = blocks[index];
  lines.splice(from, to - from + 1);

  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '');

  if (vditor) {
    // 不清空撤销栈，删错了还能撤销
    vditor.setValue(text);
  }

  activeTable = null;
  savedRange = null;
  notifyChange();
}

/* ─── 表格结构操作（借用 Vditor 内置快捷键，避免自己改 DOM） ── */

const isMac = /Mac/.test(navigator.platform);

/**
 * Vditor 即时渲染模式下的表格结构快捷键（断点见 dist/index.js 的 fixTable）。
 * 手机上没有 ⌘ 键，这里合成 keydown 事件调用它，保证撤销栈和 markdown 都由 Vditor 自己维护。
 */
const TABLE_HOTKEYS = {
  rowAbove: { key: 'F', shift: true, code: 'KeyF' },
  rowBelow: { key: '=', shift: false, code: 'Equal' },
  colLeft: { key: 'G', shift: true, code: 'KeyG' },
  colRight: { key: isMac ? '=' : '+', shift: true, code: 'Equal' },
  delRow: { key: '-', shift: false, code: 'Minus' },
  delCol: { key: isMac ? '-' : '_', shift: true, code: 'Minus' },
};

/**
 * 把光标还原到上次所在的单元格
 *
 * @returns {boolean} 是否成功定位到表格内
 */
function restoreCellRange() {
  const selection = window.getSelection();

  if (!selection) {
    return false;
  }

  if (savedRange && savedRange.startContainer && document.contains(savedRange.startContainer)) {
    selection.removeAllRanges();
    selection.addRange(savedRange);
    return !!liveCell();
  }

  return !!liveCell();
}

/**
 * 合成快捷键事件，交给 Vditor 处理表格增删行列
 *
 * @param {{key: string, shift: boolean, code: string}} hotkey
 * @returns {boolean} Vditor 是否处理了该事件
 */
function dispatchTableHotkey({ key, shift, code }) {
  const target = document.querySelector(
    '#editor .vditor-ir .vditor-reset, #editor .vditor-wysiwyg .vditor-reset',
  );

  if (!target) {
    return false;
  }

  const event = new KeyboardEvent('keydown', {
    key,
    code,
    ctrlKey: true,
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  });

  target.dispatchEvent(event);

  return event.defaultPrevented;
}

/**
 * 执行一项表格操作：删除整表走 markdown，增删行列走 Vditor 快捷键
 *
 * @param {'rowAbove'|'rowBelow'|'colLeft'|'colRight'|'delRow'|'delCol'|'deleteTable'} action
 */
function runTableAction(action) {
  const table = currentTable();

  if (!table) {
    errorHandler?.('先把光标点进要编辑的表格');
    return;
  }

  if (action === 'deleteTable') {
    deleteCurrentTable();
    return;
  }

  if (!restoreCellRange()) {
    errorHandler?.('光标不在表格里，请点一下表格再操作');
    return;
  }

  const handled = dispatchTableHotkey(TABLE_HOTKEYS[action]);

  if (!handled) {
    errorHandler?.('操作没生效，请点进单元格后重试');
    return;
  }

  // Vditor 增删行列后会重新渲染，重新记录光标位置，方便连续操作
  setTimeout(() => {
    const selection = window.getSelection();

    if (liveCell() && selection && selection.rangeCount > 0) {
      savedRange = selection.getRangeAt(0).cloneRange();
    }

    notifyChange();
  }, 80);
}

const TABLE_ACTIONS = [
  { label: '上方插行', action: 'rowAbove' },
  { label: '下方插行', action: 'rowBelow' },
  { label: '删除本行', action: 'delRow' },
  { label: '左侧插列', action: 'colLeft' },
  { label: '右侧插列', action: 'colRight' },
  { label: '删除本列', action: 'delCol' },
  { label: '删除整个表格', action: 'deleteTable', danger: true, wide: true },
];

let tableGridReady = false;

function ensureTableGrid() {
  if (tableGridReady) {
    return;
  }

  const grid = document.getElementById('table-grid');

  if (!grid) {
    return;
  }

  TABLE_ACTIONS.forEach((item) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'table-op' + (item.danger ? ' danger' : '') + (item.wide ? ' wide' : '');
    btn.textContent = item.label;
    btn.addEventListener('click', () => runTableAction(item.action));
    grid.appendChild(btn);
  });

  document.getElementById('table-close')?.addEventListener('click', () => closeSheet('table-sheet', 'table-mask'));
  document.getElementById('table-mask')?.addEventListener('click', () => closeSheet('table-sheet', 'table-mask'));

  tableGridReady = true;
}

function openTableSheet() {
  ensureTableGrid();
  openSheet('table-sheet', 'table-mask');
}

const TABLE_ICON =
  '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" style="fill:none;stroke-width:1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 4.5v15"/></svg>';

const CAMERA_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" style="fill:none;stroke-width:1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.2"/></svg>';

/* ─── 编辑器 ────────────────────────────────────────────── */

/**
 * 初始化 Vditor（工具栏对齐 Handsome 主题后台编辑器）
 *
 * @param {{value: string, mode?: 'ir'|'wysiwyg'|'sv', onChange: (value: string) => void, getCid: () => number, onError: (message: string) => void, onModeChange?: (mode: string) => void}} options
 */
export function initEditor({ value, mode = 'ir', onChange, getCid, onError, onModeChange }) {
  destroyEditor();

  currentCid = getCid;
  errorHandler = onError;
  changeHandler = onChange;
  modeHandler = onModeChange;

  vditor = new Vditor('editor', {
    mode,
    value: value || '',
    height: '100%',
    cdn: `${import.meta.env.BASE_URL}vditor`,
    placeholder: '开始写点什么…',
    cache: { enable: false },
    counter: { enable: true },
    toolbarConfig: { pin: false },
    toolbar: [
      { name: 'headings', tip: '标题' },
      { name: 'bold', tip: '加粗' },
      { name: 'italic', tip: '斜体' },
      { name: 'strike', tip: '删除线' },
      '|',
      { name: 'list', tip: '无序列表' },
      { name: 'ordered-list', tip: '有序列表' },
      { name: 'check', tip: '任务列表' },
      '|',
      { name: 'quote', tip: '引用' },
      { name: 'inline-code', tip: '行内代码' },
      { name: 'code', tip: '代码块' },
      { name: 'link', tip: '链接' },
      // 表格插入沿用 Vditor 原生按钮（带行列选择），旁边是结构操作面板
      { name: 'table', tip: '表格' },
      { name: 'tableops', tip: '表格操作', icon: TABLE_ICON, click: openTableSheet },
      { name: 'upload', tip: '上传图片' },
      { name: 'camera', tip: '拍照', icon: CAMERA_ICON, click: openCamera },
      { name: 'theme', tip: '主题元素', icon: THEME_ICON, click: openThemeSheet },
      // 内置编辑模式切换：即时渲染 / 所见即所得 / 分屏预览，切换时保留正文
      { name: 'edit-mode', tip: '编辑模式' },
      { name: 'preview', tip: '预览' },
      '|',
      { name: 'undo', tip: '撤销' },
      { name: 'redo', tip: '重做' },
    ],
    preview: {
      hljs: { enable: true, style: 'monokai', lineNumber: true },
      math: { engine: 'MathJax', inlineDigit: true },
    },
    input: (text) => onChange?.(text),
    // 首次渲染完成后按当前模式决定是否显示表格结构面板
    after: () => setTableOpsVisible(mode !== 'sv'),
    upload: {
      accept: 'image/*',
      handler: (files) => uploadFiles(Array.from(files || [])),
    },
  });

  return vditor;
}

function openCamera() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';

  input.addEventListener('change', () => {
    if (input.files && input.files.length) {
      uploadFiles(Array.from(input.files));
    }
  });

  input.click();
}

async function uploadFiles(files) {
  for (const file of files) {
    try {
      const result = await uploadImage(file, currentCid ? currentCid() : 0);

      if (vditor) {
        vditor.insertValue(`\n![${result.name || '图片'}](${result.url})\n`);
      }
    } catch (error) {
      errorHandler?.(error.message || '图片上传失败');
    }
  }
}

export function getEditorValue() {
  return vditor ? vditor.getValue() : '';
}

export function setEditorValue(value) {
  if (vditor) {
    vditor.setValue(value || '', true);
  }
}

export function destroyEditor() {
  closeEditorSheets();
  changeHandler = null;
  modeHandler = null;
  activeTable = null;
  savedRange = null;

  if (vditor) {
    vditor.destroy();
    vditor = null;
  }

  const container = document.getElementById('editor');

  if (container) {
    container.innerHTML = '';
  }
}
