import Vditor from 'vditor';
import 'vditor/dist/index.css';
import { uploadImage } from './api.js';

let vditor = null;
let currentCid = 0;
let errorHandler = null;

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
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      resolve(result);
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

const SHORTCODES = [
  {
    name: 'sc_tabs',
    tip: '插入标签页',
    icon: textIcon('标签页'),
    click: () =>
      insert(
        '[tabs]\n[tab name="标签页 1" active="true"]内容 1[/tab]\n[tab name="标签页 2"]内容 2[/tab]\n[/tabs]',
      ),
  },
  {
    name: 'sc_album',
    tip: '插入相册',
    icon: textIcon('相册'),
    click: () =>
      insert(
        '[album type="photos"]\n[这里插入图片，支持 markdown 或 html，可混排](https://)\n[/album]',
      ),
  },
  {
    name: 'sc_timeline',
    tip: '插入时间线',
    icon: textIcon('时间线'),
    click: () =>
      insert(
        '[timeline title="请输入标题" type="small"]\n[item date="2026-01-01"] 这里编辑事件内容 [/item]\n[/timeline]',
      ),
  },
  {
    name: 'sc_goal',
    tip: '插入计划表',
    icon: textIcon('计划表'),
    click: () => insert('[goal title="小目标"]\n[item check="true"] 已完成的任务 [/item]\n[item progress="50%"] 进行中的任务 [/item]\n[/goal]'),
  },
  {
    name: 'sc_column',
    tip: '插入多列布局',
    icon: textIcon('多列'),
    click: () =>
      insert(
        '[column]\n[block] 普通的一列 [/block]\n[block size="20%"]该列宽度 20%[/block]\n[/column]',
      ),
  },
];

function textIcon(label) {
  return `<span class="tb-text">${label}</span>`;
}

const CAMERA_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.2"/></svg>';

/* ─── 编辑器 ────────────────────────────────────────────── */

/**
 * 初始化 Vditor（即时渲染，工具栏对齐 Handsome 主题后台编辑器）
 *
 * @param {{value: string, onChange: (value: string) => void, getCid: () => number, onError: (message: string) => void}} options
 */
export function initEditor({ value, onChange, getCid, onError }) {
  destroyEditor();

  currentCid = getCid;
  errorHandler = onError;

  vditor = new Vditor('editor', {
    mode: 'ir',
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
      '|',
      { name: 'link', tip: '链接' },
      { name: 'table', tip: '表格' },
      { name: 'upload', tip: '上传图片' },
      { name: 'camera', tip: '拍照', icon: CAMERA_ICON, click: openCamera },
      '|',
      { name: 'undo', tip: '撤销' },
      { name: 'redo', tip: '重做' },
      '|',
      {
        name: 'more',
        tip: '主题元素',
        toolbar: [
          { name: 'insert_image', tip: '插入图片', icon: textIcon('图片'), click: insertImage },
          { name: 'insert_color', tip: '彩色文字', icon: textIcon('彩色文字'), click: insertColorWord },
          { name: 'insert_music', tip: '插入音乐', icon: textIcon('音乐'), click: insertMusic },
          { name: 'insert_video', tip: '插入视频', icon: textIcon('视频'), click: insertVideo },
          { name: 'insert_post', tip: '插入文章卡片', icon: textIcon('文章卡片'), click: insertPost },
          { name: 'insert_button', tip: '插入按钮', icon: textIcon('按钮'), click: insertButton },
          { name: 'insert_scode', tip: '高亮引用', icon: textIcon('高亮引用'), click: insertScode },
          { name: 'insert_collapse', tip: '收缩框', icon: textIcon('收缩框'), click: insertCollapse },
          {
            name: 'sc_hide',
            tip: '评论可见',
            icon: textIcon('评论可见'),
            click: () => insert(`[hide]${selected('这里编辑隐藏文本（评论可见）')}[/hide]`),
          },
          {
            name: 'sc_login',
            tip: '登录可见',
            icon: textIcon('登录可见'),
            click: () => insert(`[login]${selected('这里编辑隐藏文本（登录可见）')}[/login]`),
          },
          ...SHORTCODES,
          { name: 'outline', tip: '大纲' },
          { name: 'preview', tip: '预览' },
          { name: 'both', tip: '双栏预览' },
          { name: 'fullscreen', tip: '全屏' },
          { name: 'edit-mode', tip: '切换模式' },
          { name: 'export', tip: '导出' },
        ],
      },
    ],
    preview: {
      hljs: { enable: true, style: 'monokai', lineNumber: true },
      math: { engine: 'MathJax', inlineDigit: true },
    },
    input: (text) => onChange?.(text),
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
  if (vditor) {
    vditor.destroy();
    vditor = null;
  }

  const container = document.getElementById('editor');

  if (container) {
    container.innerHTML = '';
  }
}
