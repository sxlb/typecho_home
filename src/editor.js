import Vditor from 'vditor';
import 'vditor/dist/index.css';
import { uploadImage, call } from './api.js';
import { listSnippets, addSnippet, removeSnippet } from './local.js';

let vditor = null;
let currentCid = 0;
let errorHandler = null;
let changeHandler = null;
let modeHandler = null;
// 当前未结算的弹窗 resolve：重复打开时先按取消结算，避免旧 Promise 永远挂起
let dialogResolve = null;

/* ─── 通用输入弹窗 ──────────────────────────────────────── */

/**
 * 打开表单弹窗，返回各字段的值；用户取消时返回 null
 *
 * @param {{title: string, confirmText?: string, fields: Array<{key: string, label: string, type?: 'text'|'select'|'textarea', value?: string, placeholder?: string, options?: Array<{value: string, label: string}>}>}} config
 * @returns {Promise<Record<string, string> | null>}
 */
function openDialog({ title, confirmText = '插入', fields, raw = false }) {
  return new Promise((resolve) => {
    if (dialogResolve) {
      const previous = dialogResolve;
      dialogResolve = null;
      previous(null);
    }

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
      notifyOverlay();

      if (dialogResolve === resolve) {
        dialogResolve = null;
      }

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
        // raw 用于查找替换等需要保留首尾空格的场景
        values[key] = raw ? el.value : el.value.trim();
      });
      close(values);
    };

    cancelBtn.onclick = () => close(null);

    dialogResolve = resolve;
    root.hidden = false;
    notifyOverlay();

    const first = Object.values(inputs)[0];
    if (first) {
      setTimeout(() => first.focus(), 60);
    }
  });
}

function insert(text, range = null) {
  if (!vditor || !text) {
    return;
  }

  const before = vditor.getValue();

  try {
    // 面板/工具栏点击会让编辑器失焦，先恢复焦点与选区
    vditor.focus();

    // 异步场景（图片上传）传回发起时的选区，避免插到用户后来点过的位置
    restoreRange(range);

    vditor.insertValue(text);
    rememberRange();
  } catch {
    // 选区彻底丢失时 Vditor 会抛 IndexSizeError：
    // 内容已插入就跳过；否则追加到末尾，但必须保留撤销栈
    if (vditor.getValue() !== before) {
      notifyChange();
      return;
    }

    vditor.setValue(`${before.trimEnd()}\n${text}`, false);
    notifyChange();
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

/**
 * 查找替换：手机上没有 Ctrl+F，长文改错字全靠它
 *
 * 全部替换用 split/join 实现，避免用户输入的正则元字符被当成表达式。
 */
async function openFindReplace() {
  if (!vditor) {
    return;
  }

  const value = await openDialog({
    title: '查找替换',
    confirmText: '全部替换',
    raw: true,
    fields: [
      { key: 'find', label: '查找内容', placeholder: '要查找的文字' },
      { key: 'replace', label: '替换为', placeholder: '留空表示删除' },
    ],
  });

  if (!value || value.find === '') {
    return;
  }

  if (value.find === value.replace) {
    errorHandler?.('查找与替换内容相同，无需替换');
    return;
  }

  const current = vditor.getValue();
  const parts = current.split(value.find);
  const count = parts.length - 1;

  if (!count) {
    errorHandler?.('没有找到匹配的文字');
    return;
  }

  vditor.setValue(parts.join(value.replace), false);
  notifyChange();
  errorHandler?.(`已替换 ${count} 处`);
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

// 关闭动画延时器：按面板分别存储。共用同一个定时器时，
// 打开另一个面板会清掉正在关闭的面板的延时，留下透明遮罩拦截点击
const sheetTimers = new Map();

/** 通知 main.js 重新计算「是否有弹层打开」，用于锁定背景滚动 */
function notifyOverlay() {
  window.dispatchEvent(new Event('sxlb:overlay'));
}

function openSheet(sheetId, maskId) {
  const sheet = document.getElementById(sheetId);
  const mask = document.getElementById(maskId);

  if (!sheet || !mask) {
    return;
  }

  clearTimeout(sheetTimers.get(sheetId));
  sheetTimers.delete(sheetId);
  sheet.hidden = false;
  mask.hidden = false;
  sheet.setAttribute('aria-hidden', 'false');
  notifyOverlay();

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
  sheet.setAttribute('aria-hidden', 'true');

  clearTimeout(sheetTimers.get(sheetId));
  const timer = setTimeout(() => {
    sheet.hidden = true;
    mask.hidden = true;
    sheetTimers.delete(sheetId);
    notifyOverlay();
  }, 260);
  sheetTimers.set(sheetId, timer);

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
  const snippet = closeSheet('snippet-sheet', 'snippet-mask');
  const media = closeSheet('media-sheet', 'media-sheet-mask');

  return theme || table || snippet || media;
}

/* ─── 编辑模式即时切换（即时渲染 / 所见即所得 / 分屏预览 / 纯代码） ── */

/** 对外呈现的模式：纯代码在 Vditor 内部实际是 sv，靠样式区分 */
let uiMode = 'ir';
/** 进入纯代码前的模式，再点一次纯代码按钮时回到这里 */
let lastTextMode = 'ir';
/** 正在通过内置菜单切到 sv，用来把这次切换识别为「纯代码」 */
let pendingCode = false;

/**
 * 显示 / 隐藏工具栏里的某一项（Vditor 把按钮包在 .vditor-toolbar__item 里）
 *
 * @param {string} type 按钮的 data-type
 * @param {boolean} visible
 */
function setToolbarItemVisible(type, visible) {
  const button = document.querySelector(`#editor .vditor-toolbar [data-type="${type}"]`);
  const item = button?.closest('.vditor-toolbar__item');

  if (item) {
    item.style.display = visible ? '' : 'none';
  }
}

/**
 * 同步模式相关的界面状态
 *
 * - 纯代码：源码占满（样式类）、隐藏表格结构面板与内置预览按钮、显示「看成品」
 * - 分屏预览：源码与预览并排，表格结构直接改文本，隐藏结构面板
 *
 * @param {'ir'|'wysiwyg'|'sv'|'code'} mode
 */
function syncModeUi(mode) {
  uiMode = mode;

  const root = document.getElementById('editor');

  if (!root) {
    return;
  }

  const isCode = mode === 'code';

  root.classList.toggle('editor-code', isCode);

  if (!isCode) {
    root.classList.remove('editor-code-preview');
  }

  setToolbarItemVisible('tableops', mode !== 'sv' && !isCode);
  setToolbarItemVisible('preview', !isCode);
  setToolbarItemVisible('codepreview', isCode);

  document
    .querySelector('#editor .vditor-toolbar [data-type="codemode"]')
    ?.classList.toggle('vditor-menu--current', isCode);

  if (!isCode) {
    document
      .querySelector('#editor .vditor-toolbar [data-type="codepreview"]')
      ?.classList.remove('vditor-menu--current');
  }
}

/**
 * 通过内置「编辑模式」菜单切换模式（Vditor 没有公开的 setEditMode）
 *
 * @param {'ir'|'wysiwyg'|'sv'} mode
 * @returns {boolean} 是否成功点到目标项
 */
function switchToEditorMode(mode) {
  const trigger = document.querySelector('#editor .vditor-toolbar [data-type="edit-mode"]');

  if (!trigger) {
    return false;
  }

  const panel = trigger.parentElement?.querySelector('.vditor-hint');

  // 面板已展开时不要再点一次，否则会被收起
  if (panel && panel.style.display !== 'block') {
    trigger.click();
  }

  const target = panel?.querySelector(`button[data-mode="${mode}"]`);

  if (!target) {
    return false;
  }

  target.click();

  return true;
}

/** 进入 / 退出纯代码模式 */
function enterCodeMode() {
  if (uiMode === 'code') {
    if (lastTextMode === 'sv') {
      // 本来就是分屏预览，直接恢复并排视图即可
      syncModeUi('sv');
      modeHandler?.('sv');
    } else {
      switchToEditorMode(lastTextMode);
    }

    return;
  }

  lastTextMode = uiMode;

  // 分屏预览本身就是源码编辑，直接隐藏预览区即可
  if (vditor?.getCurrentMode?.() === 'sv') {
    syncModeUi('code');
    modeHandler?.('code');
    return;
  }

  pendingCode = true;

  if (!switchToEditorMode('sv')) {
    pendingCode = false;
  }
}

/** 纯代码模式下「看成品」：把预览区铺满成覆盖层 */
function toggleCodePreview() {
  const root = document.getElementById('editor');

  if (!root || !root.classList.contains('editor-code')) {
    return;
  }

  const open = root.classList.toggle('editor-code-preview');

  if (open) {
    // 先收起键盘，再保证预览是最新内容
    vditor?.blur?.();

    // 实时预览默认有 1 秒防抖，临时关掉让「看成品」立即出图
    const previewOptions = vditor?.vditor?.options?.preview;

    if (previewOptions) {
      const delay = previewOptions.delay;
      previewOptions.delay = 0;
      vditor.renderPreview();
      previewOptions.delay = delay;
    } else {
      vditor?.renderPreview?.();
    }
  }

  document
    .querySelector('#editor .vditor-toolbar [data-type="codepreview"]')
    ?.classList.toggle('vditor-menu--current', open);
}

// Vditor 自带的 edit-mode 面板切换后，同步记录模式（写回设置）并联动界面
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

    const clicked = button.getAttribute('data-mode');
    // 我们主动切到 sv 时，这次切换的用户意图是「纯代码」
    const mode = pendingCode && clicked === 'sv' ? 'code' : clicked;

    pendingCode = false;

    // 点的是当前模式时 Vditor 不会重建 DOM，保留表格与选区状态
    if ((vditor?.getCurrentMode?.() || '') === (mode === 'code' ? 'sv' : mode)) {
      return;
    }

    if (mode !== 'code') {
      lastTextMode = mode;
    }

    // 切换模式会重建 DOM，之前记下的表格与选区已失效
    activeTable = null;
    savedRange = null;
    syncModeUi(mode);
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
  if (!vditor) {
    return null;
  }

  // Vditor 会同时保留 ir / wysiwyg / sv 三套 DOM，只能按当前模式取可见的一层，
  // 否则永远拿到隐藏的 IR 容器，选区与上传锚点都会失效
  const mode = vditor.getCurrentMode();

  if (mode === 'wysiwyg') {
    return document.querySelector('#editor .vditor-wysiwyg .vditor-reset');
  }

  if (mode === 'ir') {
    return document.querySelector('#editor .vditor-ir');
  }

  // 分屏预览 / 纯代码是 textarea，Range 机制不适用
  return null;
}

let activeTable = null;
let savedRange = null;
// 编辑器内最后一次有效选区：上传图片等异步操作完成后据此恢复插入点
let lastEditorRange = null;

/** 记住当前选区（仅限编辑器内部），返回克隆后的 Range */
function rememberRange() {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0).cloneRange();
  const root = getEditorRoot();

  if (!root || !root.contains(range.startContainer)) {
    return null;
  }

  lastEditorRange = range;

  return range;
}

/** 把选区还原到编辑器内，失败时返回 false 交给调用方兜底 */
function restoreRange(range) {
  if (!range || !range.startContainer || !document.contains(range.startContainer)) {
    return false;
  }

  const root = getEditorRoot();

  if (!root || !root.contains(range.startContainer)) {
    return false;
  }

  const selection = window.getSelection();

  if (!selection) {
    return false;
  }

  selection.removeAllRanges();
  selection.addRange(range);

  return true;
}

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
  // 普通正文选区也记下来，图片上传完成后回到这里插入
  rememberRange();

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

  // 只统计当前模式下的表格：隐藏模式的旧 DOM 会把序号整体带偏
  const mode = vditor?.getCurrentMode() === 'wysiwyg' ? 'wysiwyg' : 'ir';
  const tables = Array.from(
    document.querySelectorAll(`#editor .vditor-${mode} table`),
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

  const matched = matchTableBlock(table, blocks, lines);
  const block = matched ?? (index >= 0 && index < blocks.length ? blocks[index] : null);

  if (!block) {
    errorHandler?.('没定位到表格，请重新点一下表格再删');
    return;
  }

  const [from, to] = block;
  lines.splice(from, to - from + 1);

  // 表格两侧原本各有一个空行，删除后会在接缝处留下连续空行；
  // 只合并接缝，保留正文其它位置刻意的留白
  while (from > 0 && from < lines.length
    && lines[from - 1].trim() === '' && lines[from].trim() === '') {
    lines.splice(from, 1);
  }

  const text = lines.join('\n').replace(/^\n+/, '');

  if (vditor) {
    // 第二个参数 clearStack 传 false，删错了还能撤销
    vditor.setValue(text, false);
  }

  activeTable = null;
  savedRange = null;
  notifyChange();
}

/**
 * 用首行文本匹配 markdown 表格块，纠正「DOM 表格序号 ≠ markdown 块序号」的错位
 *
 * @returns {[number, number] | null} 唯一匹配时返回块的行号范围
 */
function matchTableBlock(table, blocks, lines) {
  const row = table.querySelector('tr');

  if (!row) {
    return null;
  }

  const wanted = Array.from(row.children)
    .map((cell) => normalizeCell(cell.textContent))
    .join('|');

  if (!wanted.replace(/\|/g, '')) {
    return null;
  }

  const matched = blocks.filter(([from]) => {
    const cells = lines[from].trim().replace(/^\||\|$/g, '').split('|');

    return cells.map(normalizeCell).join('|') === wanted;
  });

  return matched.length === 1 ? matched[0] : null;
}

/**
 * 去掉 markdown 装饰，仅保留可比较的纯文本
 */
function normalizeCell(text) {
  return String(text || '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
  // 必须派发给当前可见的模式：隐藏层的事件处理会消费掉快捷键且丢失光标
  const target = vditor?.getCurrentMode() === 'wysiwyg'
    ? document.querySelector('#editor .vditor-wysiwyg .vditor-reset')
    : document.querySelector('#editor .vditor-ir');

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

const SNIPPET_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" style="fill:none;stroke-width:1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.2L5.5 20.5v-16a1 1 0 0 1 1-1z"/></svg>';

const CODE_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" style="fill:none;stroke-width:1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/></svg>';

const EYE_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" style="fill:none;stroke-width:1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.6"/></svg>';

const FIND_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" style="fill:none;stroke-width:1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.3"/><path d="M15.8 15.8L21 21"/></svg>';

const MEDIA_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" style="fill:none;stroke-width:1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="9.5" r="1.6"/><path d="M4.5 17l4.8-4.4 3.2 2.9 3-2.6 4 3.6"/></svg>';

/* ─── 片段库（常用开头、声明、SEO 描述等，只存本机） ────── */

let snippetSheetReady = false;

function snippetPreview(text) {
  return String(text || '')
    .replace(/[#>*`|\-\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

function renderSnippetList() {
  const node = document.getElementById('snippet-list');

  if (!node) {
    return;
  }

  node.innerHTML = '';
  const items = listSnippets();

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'snippet-empty';
    empty.textContent = '还没有片段，点下方新建一条';
    node.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'snippet-item';

    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'snippet-info';

    const name = document.createElement('div');
    name.className = 'snippet-name';
    name.textContent = item.name;

    const preview = document.createElement('div');
    preview.className = 'snippet-preview';
    preview.textContent = snippetPreview(item.text);

    pick.append(name, preview);
    pick.addEventListener('click', () => {
      closeSheet('snippet-sheet', 'snippet-mask');
      insert(item.text.endsWith('\n') ? item.text : `${item.text}\n`);
    });

    // 两段式删除：先变成「确认」，再点一次才真正删除
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'snippet-del';
    del.textContent = '×';
    del.setAttribute('aria-label', '删除片段');
    let armed = false;
    del.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        del.textContent = '确认';
        del.style.width = 'auto';
        del.style.padding = '0 8px';
        del.style.fontSize = '12px';
        return;
      }

      removeSnippet(item.id);
      renderSnippetList();
    });

    row.append(pick, del);
    node.appendChild(row);
  });
}

async function createSnippet() {
  const value = await openDialog({
    title: '新建片段',
    confirmText: '保存',
    fields: [
      { key: 'name', label: '名称', placeholder: '例如：文末声明' },
      {
        key: 'text',
        label: '内容',
        type: 'textarea',
        value: vditor?.getSelection()?.trim() || '',
        placeholder: '支持 Markdown 与主题短代码',
      },
    ],
  });

  if (!value || !value.text) {
    return;
  }

  addSnippet({ name: value.name, text: value.text });
  renderSnippetList();
}

function ensureSnippetSheet() {
  if (snippetSheetReady) {
    return;
  }

  document.getElementById('snippet-close')?.addEventListener('click', () =>
    closeSheet('snippet-sheet', 'snippet-mask'),
  );
  document.getElementById('snippet-mask')?.addEventListener('click', () =>
    closeSheet('snippet-sheet', 'snippet-mask'),
  );
  document.getElementById('snippet-add')?.addEventListener('click', createSnippet);

  snippetSheetReady = true;
}

function openSnippetSheet() {
  ensureSnippetSheet();
  renderSnippetList();
  openSheet('snippet-sheet', 'snippet-mask');
}

/* ─── 媒体库（插入已上传图片，避免重复上传） ─────────────── */

const MEDIA_PAGE_SIZE = 24;

const mediaState = {
  items: [],
  page: 1,
  hasMore: true,
  loading: false,
  seq: 0,
  ready: false,
  // 多选模式：批量插入多张图
  selecting: false,
  selected: new Set(),
};

function ensureMediaSheet() {
  if (mediaState.ready) {
    return;
  }

  document.getElementById('media-close')?.addEventListener('click', closeMediaSheet);
  document.getElementById('media-sheet-mask')?.addEventListener('click', closeMediaSheet);
  document.getElementById('media-select')?.addEventListener('click', toggleMediaSelect);
  document.getElementById('media-insert')?.addEventListener('click', insertSelectedMedia);
  document.getElementById('media-more')?.addEventListener('click', () => {
    mediaState.page += 1;
    loadMedia(false);
  });

  mediaState.ready = true;
}

function closeMediaSheet() {
  closeSheet('media-sheet', 'media-sheet-mask');
  resetMediaSelect();
}

function resetMediaSelect() {
  mediaState.selecting = false;
  mediaState.selected.clear();

  const button = document.getElementById('media-select');

  if (button) {
    button.textContent = '多选';
  }

  updateMediaActions();
}

function toggleMediaSelect() {
  mediaState.selecting = !mediaState.selecting;
  mediaState.selected.clear();

  const button = document.getElementById('media-select');

  if (button) {
    button.textContent = mediaState.selecting ? '取消多选' : '多选';
  }

  updateMediaActions();
  renderMedia();
}

function updateMediaActions() {
  const bar = document.getElementById('media-actions');
  const count = document.getElementById('media-count');
  const insertButton = document.getElementById('media-insert');

  if (!bar) {
    return;
  }

  bar.hidden = !mediaState.selecting;

  if (count) {
    count.textContent = `已选 ${mediaState.selected.size} 张`;
  }

  if (insertButton) {
    insertButton.disabled = mediaState.selected.size === 0;
  }
}

function insertSelectedMedia() {
  const urls = mediaState.items
    .filter((item) => mediaState.selected.has(item.cid))
    .map((item) => item.url);

  if (!urls.length) {
    return;
  }

  closeMediaSheet();
  insert(urls.map((url) => `![](${url})`).join('\n\n'));
}

function updateMediaMore() {
  const more = document.getElementById('media-more');

  if (!more) {
    return;
  }

  more.hidden = !mediaState.hasMore || mediaState.loading;
  more.textContent = mediaState.loading ? '加载中…' : '加载更多';
  more.disabled = mediaState.loading;
}

function renderMedia() {
  const grid = document.getElementById('media-grid');
  const empty = document.getElementById('media-empty');
  const body = document.querySelector('.media-sheet-body');

  if (!grid) {
    return;
  }

  // 重建列表后恢复滚动位置，多选切换时不会跳回顶部
  const scroll = body ? body.scrollTop : 0;

  grid.innerHTML = '';
  empty.hidden = mediaState.items.length > 0;
  updateMediaMore();
  updateMediaActions();

  mediaState.items.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'media-cell';
    button.setAttribute('aria-label', `插入 ${item.name || '图片'}`);

    const image = document.createElement('img');
    image.src = item.url;
    image.alt = '';
    image.loading = 'lazy';

    button.appendChild(image);

    if (mediaState.selecting) {
      const badge = document.createElement('span');
      badge.className = 'media-badge';

      if (mediaState.selected.has(item.cid)) {
        button.classList.add('selected');
        badge.textContent = String([...mediaState.selected].indexOf(item.cid) + 1);
      }

      button.appendChild(badge);
    }

    button.addEventListener('click', () => {
      if (mediaState.selecting) {
        if (mediaState.selected.has(item.cid)) {
          mediaState.selected.delete(item.cid);
        } else {
          mediaState.selected.add(item.cid);
        }

        renderMedia();
        return;
      }

      closeMediaSheet();
      insert(`![](${item.url})`);
    });

    grid.appendChild(button);
  });

  if (body) {
    body.scrollTop = scroll;
  }
}

async function loadMedia(reset = true) {
  // 重置请求允许打断进行中的加载：否则关掉再打开面板会一直看到旧列表
  if (reset) {
    mediaState.page = 1;
    mediaState.hasMore = true;
  } else if (mediaState.loading) {
    return;
  }

  if (!mediaState.hasMore) {
    return;
  }

  const seq = (mediaState.seq += 1);
  mediaState.loading = true;
  updateMediaMore();

  if (reset) {
    // 重新加载期间先不显示「还没有图片」，避免误导
    const empty = document.getElementById('media-empty');

    if (empty) {
      empty.hidden = true;
    }
  }

  try {
    const data = await call('media', {
      query: { page: mediaState.page, size: MEDIA_PAGE_SIZE, image: 1 },
    });

    if (seq !== mediaState.seq) {
      return;
    }

    const items = Array.isArray(data?.items) ? data.items : [];
    const exists = new Set(mediaState.items.map((item) => item.cid));

    mediaState.items = reset
      ? items
      : mediaState.items.concat(items.filter((item) => !exists.has(item.cid)));
    mediaState.hasMore =
      typeof data?.total === 'number'
        ? mediaState.items.length < data.total
        : items.length >= MEDIA_PAGE_SIZE;

    renderMedia();
  } catch (error) {
    if (seq === mediaState.seq) {
      errorHandler?.(error.message);

      if (reset) {
        mediaState.items = [];
        // 首页失败时不再显示「加载更多」，避免下次直接跳过第 1 页
        mediaState.hasMore = false;
        renderMedia();
      } else {
        mediaState.page = Math.max(1, mediaState.page - 1);
        mediaState.hasMore = true;
      }
    }
  } finally {
    if (seq === mediaState.seq) {
      mediaState.loading = false;
      updateMediaMore();
    }
  }
}

function openMediaSheet() {
  ensureMediaSheet();
  resetMediaSelect();
  openSheet('media-sheet', 'media-sheet-mask');
  renderMedia();

  // 每次打开都重拉第一页，刚在管理页上传的图也能马上选到
  loadMedia(true);
}

/* ─── 编辑器 ────────────────────────────────────────────── */

/**
 * 初始化 Vditor（工具栏对齐 Handsome 主题后台编辑器）
 *
 * @param {{value: string, mode?: 'ir'|'wysiwyg'|'sv'|'code', onChange: (value: string) => void, getCid: () => number, onError: (message: string) => void, onModeChange?: (mode: string) => void}} options
 */
export function initEditor({ value, mode = 'ir', onChange, getCid, onError, onModeChange }) {
  destroyEditor();

  currentCid = getCid;
  errorHandler = onError;
  changeHandler = onChange;
  modeHandler = onModeChange;

  // Vditor 没有纯代码模式：用 sv（源码）模式 + 样式隐藏预览区实现
  const vditorMode = mode === 'code' ? 'sv' : mode;

  lastTextMode = mode === 'code' ? 'ir' : mode;
  pendingCode = false;

  vditor = new Vditor('editor', {
    mode: vditorMode,
    value: value || '',
    height: '100%',
    cdn: `${import.meta.env.BASE_URL}vditor`,
    // 深色模式由 main.js 写在 <html data-theme> 上，编辑器跟随
    theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'classic',
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
      { name: 'media', tip: '媒体库', icon: MEDIA_ICON, click: openMediaSheet },
      { name: 'theme', tip: '主题元素', icon: THEME_ICON, click: openThemeSheet },
      { name: 'snippets', tip: '片段库', icon: SNIPPET_ICON, click: openSnippetSheet },
      { name: 'findreplace', tip: '查找替换', icon: FIND_ICON, click: openFindReplace },
      // 内置编辑模式切换：即时渲染 / 所见即所得 / 分屏预览，切换时保留正文
      { name: 'edit-mode', tip: '编辑模式' },
      // 纯代码：只显示 Markdown 源码，右侧「看成品」按需整屏预览
      { name: 'codemode', tip: '纯代码模式', icon: CODE_ICON, click: enterCodeMode },
      { name: 'codepreview', tip: '看成品', icon: EYE_ICON, click: toggleCodePreview },
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
    // 首次渲染完成后同步模式相关的按钮与样式
    after: () => {
      syncModeUi(mode);
      // 工具栏此时才真正挂到 DOM，重新量一次高度，悬浮按钮才不会压住它
      bindToolbarToggle();
    },
    upload: {
      accept: 'image/*',
      // 相册多选：粘贴 / 拖拽的图片也走同一个 handler
      multiple: true,
      handler: (files) => uploadFiles(Array.from(files || [])),
    },
  });

  bindToolbarToggle();

  return vditor;
}

const TOOLBAR_KEY = 'sxlb.editorToolbarCollapsed';
// 工具栏高度观察器：尺寸变化时同步给悬浮按钮，避免按钮压住工具栏
let toolbarObserver = null;
let observedToolbar = null;

/**
 * 底部工具栏的收起 / 展开
 *
 * 状态存本机，下次打开编辑器沿用；写作时收起可以把屏幕留给正文。
 */
function bindToolbarToggle() {
  const wrap = document.getElementById('editor-wrap');
  const toggle = document.getElementById('editor-tool-toggle');

  if (!wrap || !toggle) {
    return;
  }

  const collapsed = localStorage.getItem(TOOLBAR_KEY) === '1';
  wrap.classList.toggle('toolbar-collapsed', collapsed);
  toggle.setAttribute('aria-label', collapsed ? '展开工具栏' : '收起工具栏');

  // 工具栏高度随屏幕宽度 / 字号变化，实时量出来给悬浮按钮定位。
  // Vditor 的工具栏可能晚于 initEditor 才渲染，所以每次同步都重新查询节点。
  const syncToolbarHeight = () => {
    const bar = document.querySelector('#editor .vditor-toolbar');

    wrap.style.setProperty('--editor-toolbar-height', `${bar ? bar.offsetHeight : 0}px`);

    if (bar && bar !== observedToolbar && typeof ResizeObserver === 'function') {
      toolbarObserver?.disconnect();
      toolbarObserver = new ResizeObserver(syncToolbarHeight);
      toolbarObserver.observe(bar);
      observedToolbar = bar;
    }
  };

  toolbarObserver?.disconnect();
  toolbarObserver = null;
  observedToolbar = null;

  syncToolbarHeight();

  toggle.onclick = () => {
    const next = !wrap.classList.contains('toolbar-collapsed');

    wrap.classList.toggle('toolbar-collapsed', next);
    toggle.setAttribute('aria-label', next ? '展开工具栏' : '收起工具栏');
    syncToolbarHeight();

    try {
      localStorage.setItem(TOOLBAR_KEY, next ? '1' : '0');
    } catch {
      // 隐私模式下写不进去，只影响下次打开的默认状态
    }
  };
}

function openCamera() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';
  // 桌面端会忽略 capture，允许多选；手机上仍然直接唤起相机
  input.multiple = true;

  input.addEventListener('change', () => {
    if (input.files && input.files.length) {
      uploadFiles(Array.from(input.files));
    }
  });

  input.click();
}

/* ─── 图片上传：进度条 + 失败重试 + 取消 ───────────────── */

const uploadState = { items: [], running: false };

// 上传批次代号：销毁编辑器时递增，旧批次的异步结果据此丢弃，避免销毁后仍往正文插图
let uploadEpoch = 0;
// 选图批次的序号：每批的插入位置存在各自的队列项上，互不覆盖
let uploadBatch = 0;
let uploadHideTimer = null;

function ensureUploadBar() {
  let bar = document.getElementById('upload-bar');

  if (bar) {
    return bar;
  }

  bar = document.createElement('div');
  bar.id = 'upload-bar';
  bar.className = 'upload-bar';
  bar.innerHTML = '<span class="upload-spinner"></span><span class="upload-text"></span>';
  document.body.appendChild(bar);

  return bar;
}

function hideUploadBar() {
  clearTimeout(uploadHideTimer);
  document.getElementById('upload-bar')?.remove();
}

function cancelUploads() {
  uploadState.items.forEach((item) => {
    if (item.status === 'pending' || item.status === 'uploading') {
      item.status = 'cancelled';
    }
  });

  renderUploadBar();
}

function renderUploadBar() {
  if (!uploadState.items.length && !uploadState.running) {
    return;
  }

  const bar = ensureUploadBar();
  const failed = uploadState.items.filter((item) => item.status === 'failed');
  const done = uploadState.items.filter((item) => item.status === 'done').length;
  const cancelled = uploadState.items.some((item) => item.status === 'cancelled');
  const index = uploadState.items.findIndex((item) => item.status === 'uploading');
  const busy = uploadState.running;

  bar.classList.toggle('failed', !busy && failed.length > 0);
  bar.querySelector('.upload-spinner').hidden = !busy;

  let text;

  if (busy) {
    const current = index >= 0 ? index + 1 : uploadState.items.length;
    text =
      uploadState.items.length > 1
        ? `正在上传 ${current}/${uploadState.items.length} 张…`
        : '图片上传中…';
  } else if (failed.length) {
    text = `${failed.length} 张图片上传失败`;
  } else if (cancelled) {
    text = '已取消上传';
  } else {
    text = `${done} 张图片已插入`;
  }

  bar.querySelector('.upload-text').textContent = text;

  let act = bar.querySelector('.upload-act');

  if (busy) {
    if (!act) {
      act = document.createElement('button');
      act.type = 'button';
      act.className = 'upload-act';
      bar.appendChild(act);
    }

    act.textContent = '取消';
    act.onclick = cancelUploads;
    return;
  }

  if (failed.length) {
    if (!act) {
      act = document.createElement('button');
      act.type = 'button';
      act.className = 'upload-act';
      bar.appendChild(act);
    }

    act.textContent = '重试';
    act.onclick = () => {
      clearTimeout(uploadHideTimer);
      uploadState.items = failed.map((item) => ({ ...item, status: 'pending' }));
      runUploadQueue();
    };
    return;
  }

  act?.remove();

  clearTimeout(uploadHideTimer);

  if (cancelled) {
    uploadHideTimer = setTimeout(hideUploadBar, 900);
    return;
  }

  uploadHideTimer = setTimeout(hideUploadBar, 1600);
}

async function runUploadQueue() {
  if (uploadState.running) {
    return;
  }

  const epoch = uploadEpoch;
  uploadState.running = true;

  for (const item of uploadState.items) {
    // 编辑器已销毁或已被新批次接管：旧队列立即停手，结果全部丢弃
    if (epoch !== uploadEpoch) {
      return;
    }

    if (item.status !== 'pending') {
      continue;
    }

    item.status = 'uploading';
    renderUploadBar();

    try {
      const result = await uploadImage(item.file, currentCid ? currentCid() : 0);

      if (epoch !== uploadEpoch) {
        return;
      }

      // 上传期间用户点了取消：结果丢弃，不再插入正文
      if (item.status === 'cancelled') {
        renderUploadBar();
        continue;
      }

      insert(`\n![${result.name || '图片'}](${result.url})\n`, item.anchor);
      // 光标此时停在刚插入的图片之后：把本批剩余待传图片的锚点一起推进，
      // 保证同批图片按顺序排列，同时不影响另一批次已记下的位置
      const next = rememberRange() || item.anchor;

      uploadState.items.forEach((pending) => {
        if (pending.batch === item.batch && pending.status === 'pending') {
          pending.anchor = next;
        }
      });
      item.status = 'done';
    } catch (error) {
      if (epoch !== uploadEpoch) {
        return;
      }

      if (item.status === 'cancelled') {
        renderUploadBar();
        continue;
      }

      item.status = 'failed';
      item.error = error.message || '图片上传失败';
    }

    renderUploadBar();
  }

  if (epoch !== uploadEpoch) {
    return;
  }

  uploadState.running = false;

  const failed = uploadState.items.filter((item) => item.status === 'failed');
  const done = uploadState.items.filter((item) => item.status === 'done').length;

  if (failed.length) {
    renderUploadBar();
    errorHandler?.(`${failed.length} 张图片上传失败，点底部提示条可重试`);
  } else if (done) {
    // 给成功提示留一拍再清空
    renderUploadBar();
    uploadState.items = [];
  } else {
    // 全部取消：直接收起提示条
    uploadState.items = [];
    hideUploadBar();
  }
}

async function uploadFiles(files) {
  if (!files.length || !vditor) {
    return;
  }

  // 入队时记住光标位置；文件选择器关掉后选区可能已丢失，退回最后一次有效位置。
  // 位置跟随队列项与批次号，上传中再次选图不会覆盖前一批的插入点
  const anchor = rememberRange() || (lastEditorRange ? lastEditorRange.cloneRange() : null);
  const batch = ++uploadBatch;

  files.forEach((file) => {
    uploadState.items.push({ file, status: 'pending', batch, anchor });
  });

  await runUploadQueue();
}

export function getEditorValue() {
  return vditor ? vditor.getValue() : '';
}

export function setEditorValue(value) {
  if (vditor) {
    vditor.setValue(value || '', true);
  }
}

/**
 * 同步编辑器主题
 *
 * Vditor 不会自动响应 <html data-theme>，系统深浅色切换后必须显式调用 setTheme。
 *
 * @param {'light'|'dark'} theme
 */
export function applyEditorTheme(theme) {
  if (!vditor || typeof vditor.setTheme !== 'function') {
    return;
  }

  vditor.setTheme(theme === 'dark' ? 'dark' : 'classic');
}

export function destroyEditor() {
  closeEditorSheets();
  // 递增批次号：仍在等待响应的上传请求回来后直接丢弃结果
  uploadEpoch += 1;
  hideUploadBar();
  uploadState.items = [];
  uploadState.running = false;
  changeHandler = null;
  modeHandler = null;
  activeTable = null;
  savedRange = null;
  lastEditorRange = null;

  if (vditor) {
    vditor.destroy();
    vditor = null;
  }

  const container = document.getElementById('editor');

  if (container) {
    container.innerHTML = '';
    // Vditor 只清 vditor 类，这里把模式相关的残留一起清掉
    container.classList.remove('vditor--dark', 'editor-code', 'editor-code-preview');
  }
}
