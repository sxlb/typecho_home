/**
 * 接口封装：HMAC 签名 + 请求发送
 *
 * 签名串与服务端保持一致：
 *   ts + "\n" + path + "\n" + rawBody
 * multipart 上传无法读取原始请求体，约定对空串签名。
 */

export const DEFAULT_SETTINGS = {
  server: 'https://blog.sxlb.xyz',
  token: '',
  secret: '',
  // 编辑器模式：ir 即时渲染 / wysiwyg 所见即所得 / sv 分屏预览 / code 纯代码
  editorMode: 'ir',
  // 写作字号：small / normal / large / xlarge
  editorFontSize: 'normal',
  // 外观：auto 跟随系统 / light 浅色 / dark 深色
  theme: 'auto',
};

const SETTINGS_KEY = 'sxlb.settings';

export function getSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function isConfigured(settings = getSettings()) {
  return Boolean(settings.server && settings.token && settings.secret);
}

function baseUrl(server) {
  return String(server || '').replace(/\/+$/, '');
}

async function sign(secret, message) {
  if (!window.crypto?.subtle) {
    throw new Error('当前环境不支持 WebCrypto，请使用系统 WebView 或 Chrome 调试');
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const buffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));

  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function authHeaders(secret, path, rawBody) {
  const ts = String(Math.floor(Date.now() / 1000));
  const signature = await sign(secret, `${ts}\n${path}\n${rawBody}`);

  return {
    'X-Sxlb-Token': getSettings().token,
    'X-Sxlb-Ts': ts,
    'X-Sxlb-Sign': signature,
  };
}

async function send(url, options, path, rawBody) {
  const settings = getSettings();

  if (!isConfigured(settings)) {
    throw new Error('请先在设置中填写服务器地址、Token 与 Secret');
  }

  const headers = { ...options.headers, ...(await authHeaders(settings.secret, path, rawBody)) };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);

  let response;

  try {
    response = await fetch(url, { ...options, headers, signal: controller.signal });
  } catch (error) {
    throw new Error(
      error.name === 'AbortError' ? '请求超时，请检查网络后重试' : '网络请求失败，请检查服务器地址与网络',
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let payload;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`服务器返回异常（HTTP ${response.status}）`);
  }

  if (!response.ok || payload.status !== 'success') {
    throw new Error(payload.message || `请求失败（HTTP ${response.status}）`);
  }

  return payload.data;
}

/**
 * 调用接口
 *
 * @param {string} action ping / posts / post / save ...
 * @param {{method?: string, query?: Record<string, unknown>, body?: object}} options
 */
export async function call(action, options = {}) {
  const settings = getSettings();
  const signPath = `/writer-api/${action}`;
  const query = options.query
    ? new URLSearchParams(
        Object.entries(options.query).filter(([, value]) => value !== undefined && value !== null),
      ).toString()
    : '';
  const rawBody = options.body ? JSON.stringify(options.body) : '';

  return send(
    baseUrl(settings.server) + signPath + (query ? `?${query}` : ''),
    {
      method: options.method || 'GET',
      headers: rawBody ? { 'Content-Type': 'application/json' } : {},
      body: rawBody || undefined,
    },
    signPath,
    rawBody,
  );
}

/**
 * 上传图片
 *
 * 手机原图常常超过服务器 upload_max_filesize（2M），先在前端等比压缩。
 *
 * @param {File} file
 * @param {number} cid 关联文章，0 表示不关联
 * @returns {Promise<{url: string, name: string}>}
 */
export async function uploadImage(file, cid = 0) {
  const settings = getSettings();
  const path = '/writer-api/upload';
  const payload = await compressImage(file);
  const form = new FormData();

  form.append('file', payload, payload.name || `image-${Date.now()}.jpg`);

  if (cid) {
    form.append('cid', String(cid));
  }

  return send(`${baseUrl(settings.server)}${path}`, { method: 'POST', body: form }, path, '');
}

const MAX_EDGE = 1600;
const MAX_SIZE = 1.6 * 1024 * 1024;

async function compressImage(file) {
  const isImage = /^image\//.test(file.type) && !/gif|svg/.test(file.type);

  if (!isImage || file.size <= MAX_SIZE) {
    return file;
  }

  const bitmap = await createImageBitmap(file).catch(() => null);

  if (!bitmap) {
    return file;
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));

  if (!blob) {
    return file;
  }

  const name = (file.name || 'image').replace(/\.[^.]+$/, '') + '.jpg';

  return new File([blob], name, { type: 'image/jpeg' });
}
