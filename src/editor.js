import Vditor from 'vditor';
import 'vditor/dist/index.css';
import { uploadImage } from './api.js';

let vditor = null;
let currentCid = 0;
let errorHandler = null;

/**
 * 初始化 Vditor（即时渲染模式）
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
    counter: { enable: false },
    toolbarConfig: { pin: false },
    toolbar: [
      { name: 'bold', tip: '加粗' },
      { name: 'italic', tip: '斜体' },
      { name: 'strikethrough', tip: '删除线' },
      { name: '|' },
      { name: 'headings', tip: '标题' },
      { name: 'list', tip: '无序列表' },
      { name: 'ordered-list', tip: '有序列表' },
      { name: '|' },
      { name: 'quote', tip: '引用' },
      { name: 'code', tip: '代码块' },
      { name: 'link', tip: '链接' },
      {
        name: 'camera',
        tip: '拍照上传',
        icon: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.2"/></svg>',
        click: openCamera,
      },
      { name: 'undo', tip: '撤销' },
      { name: 'redo', tip: '重做' },
    ],
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
