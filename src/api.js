/**
 * 接口封装：HMAC 签名 + 请求发送
 *
 * 签名串与服务端保持一致：
 *   ts + "\n" + nonce + "\n" + path + "\n" + rawBody
 * nonce 为每次请求新生成的 32 位随机串，服务端用它做一次性校验，防止请求被重放。
 * multipart 上传无法读取原始请求体，约定对空串签名。
 */

export const DEFAULT_SETTINGS = {
  // 不预填任何站点：每个用户填自己的地址，避免把 Token 发往他人域名
  server: '',
  token: '',
  secret: '',
  // 编辑器模式：ir 即时渲染 / wysiwyg 所见即所得 / sv 分屏预览 / code 纯代码
  editorMode: 'ir',
  // 写作字号：small / normal / large / xlarge
  editorFontSize: 'normal',
  // 外观：auto 跟随系统 / light 浅色 / dark 深色
  theme: 'auto',
  // 界面风格：classic 经典 / paper 纸感 / soft 柔和 / contrast 高对比 / custom 自定义
  style: 'soft',
  // 自定义主题：背景与卡片色只在浅色模式生效，深色沿用内置深色底
  customTheme: {
    accent: '#2e7d6b',
    bg: '#f2f5f4',
    surface: '#ffffff',
    radius: 18,
  },
  // 管理模式：on 显示入口 / off 隐藏入口（服务端还需开启「管理接口」）
  adminMode: 'off',
  // 「我的」页管理入口排布：compact 一行 5 列 / relaxed 两行（3 + 2）
  meLayout: 'compact',
  // 打开已发布文章：preview 先看预览 / edit 直接进编辑器
  postOpenMode: 'preview',
};

const SETTINGS_KEY = 'sxlb.settings';

export function getSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      customTheme: { ...DEFAULT_SETTINGS.customTheme, ...(saved.customTheme || {}) },
    };
  } catch {
    return { ...DEFAULT_SETTINGS, customTheme: { ...DEFAULT_SETTINGS.customTheme } };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch {
    // 存储已满时设置无法落盘，调用方可通过返回值提示
    return false;
  }
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

/**
 * 生成一次性随机串
 *
 * 16 字节转十六进制得到 32 位，与服务端 /^[A-Za-z0-9]{32}$/ 的校验一致。
 *
 * @returns {string}
 */
function createNonce() {
  const bytes = new Uint8Array(16);

  if (window.crypto?.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // 极端环境兜底：没有 CSPRNG 时用时间与随机数拼出 32 位十六进制
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function authHeaders(secret, path, rawBody) {
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = createNonce();
  const signature = await sign(secret, `${ts}\n${nonce}\n${path}\n${rawBody}`);

  return {
    'X-Sxlb-Token': getSettings().token,
    'X-Sxlb-Ts': ts,
    'X-Sxlb-Nonce': nonce,
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
  let text;

  try {
    response = await fetch(url, { ...options, headers, signal: controller.signal });
    // 读取响应体也必须在超时保护内：只拿到响应头不算请求完成，
    // 否则弱网下 text() 一直挂着会让上传队列永远停在「上传中」
    text = await response.text();
  } catch (error) {
    const failure = new Error(
      error.name === 'AbortError' ? '请求超时，请检查网络后重试' : '网络请求失败，请检查服务器地址与网络',
    );

    // 标记「没拿到服务端响应」：发布流程据此判断能否进待发队列
    failure.network = true;
    throw failure;
  } finally {
    clearTimeout(timer);
  }

  let payload;

  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`服务器返回异常（HTTP ${response.status}）`);
  }

  // 合法 JSON 也可能不是对象（null / 数组 / 标量），直接读 status 会抛 TypeError
  if (!payload || typeof payload !== 'object') {
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
 * 签名路径包含 query 串（与服务端 $_SERVER['QUERY_STRING'] 逐字节一致），
 * 否则鉴权通过后仍可篡改 page / status / cid 等参数。
 *
 * @param {string} action ping / posts / post / save ...
 * @param {{method?: string, query?: Record<string, unknown>, body?: object}} options
 */
export async function call(action, options = {}) {
  const settings = getSettings();
  const path = `/writer-api/${action}`;
  const query = options.query
    ? new URLSearchParams(
        Object.entries(options.query).filter(([, value]) => value !== undefined && value !== null),
      ).toString()
    : '';
  const signPath = query ? `${path}?${query}` : path;
  const rawBody = options.body ? JSON.stringify(options.body) : '';

  return send(
    baseUrl(settings.server) + signPath,
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
 * 调用管理接口
 *
 * 签名路径为 /writer-api/admin/{do}，与服务端 Action 的分发保持一致。
 *
 * @param {string} action overview / plugins / pluginConfig / savePluginConfig
 * @param {{method?: string, query?: Record<string, unknown>, body?: object}} options
 */
export async function callAdmin(action, options = {}) {
  return call(`admin/${action}`, options);
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
