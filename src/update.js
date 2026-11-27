/**
 * 应用更新：检测新版本、下载 APK、拉起系统安装器
 *
 * 为什么不用 fetch：
 *   GitHub 的 release 资产会 302 跳到 objects.githubusercontent.com，
 *   该域名不返回 CORS 头，WebView 里 fetch 会被直接拦掉。
 *   因此原生端统一走 CapacitorHttp（OkHttp 发请求，不受同源限制）。
 *
 * 国内网络直连 GitHub 经常超时，所以默认优先走公共加速镜像，
 * 镜像都失败才回落到直连。镜像只是传输通道：安装时 Android 会校验新包签名
 * 与已装版本一致，不一致会被系统直接拒绝，不会装上来路不明的包。
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';

const RELEASE_API = 'https://api.github.com/repos/sxlb/typecho_home/releases/tags/latest';
const APK_NAME = 'sxlb-writer.apk';
const APK_MIME = 'application/vnd.android.package-archive';
/** APK 是 zip，前 4 字节 PK\x03\x04 的 base64 前缀；用来识别镜像返回的错误页 */
const APK_MAGIC = 'UEsDB';
/** 小于这个体积的必然是坏包，不再尝试安装 */
const APK_MIN_SIZE = 1024 * 1024;

/** 公共 GitHub 加速镜像：默认先走镜像，全部失败再直连 */
const MIRRORS = ['https://gh-proxy.com/', 'https://ghproxy.net/', 'https://ghfast.top/'];

/**
 * 生成候选地址：镜像优先，直连兜底
 *
 * @param {string} url GitHub 原始地址（release 接口或 APK）
 * @returns {Array<{name: string, url: string}>}
 */
function sources(url) {
  return [
    ...MIRRORS.map((prefix) => ({ name: new URL(prefix).host, url: prefix + url })),
    { name: 'GitHub 直连', url },
  ];
}

/**
 * 原生端用 CapacitorHttp 拿 JSON，Web 端退回 fetch（开发预览用）
 *
 * @param {string} url
 * @returns {Promise<object>}
 */
async function getJson(url) {
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({
      url,
      headers: { Accept: 'application/vnd.github+json' },
      connectTimeout: 10000,
      readTimeout: 15000,
    });

    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}`);
    }

    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  }

  const response = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * 读取最新发布信息
 *
 * 版本号放在 release 正文里（tag 恒为 latest），所以从 body 里解析。
 *
 * @returns {Promise<{version: string, apkUrl: string, size: number}>}
 */
export async function fetchLatestRelease() {
  let lastError = new Error('检测更新失败');

  // 接口同样默认走镜像：部分网络下 api.github.com 完全不可达
  for (const source of sources(RELEASE_API)) {
    try {
      const data = await getJson(source.url);
      const match = String(data?.body || '').match(/版本[：:]\s*v?([\d.]+)/);

      if (!match) {
        throw new Error('发布信息里没有版本号');
      }

      const asset = (Array.isArray(data.assets) ? data.assets : []).find((item) =>
        /\.apk$/i.test(String(item?.name || '')),
      );

      if (!asset?.browser_download_url) {
        throw new Error('发布里没有 APK 资产');
      }

      return {
        version: match[1],
        apkUrl: String(asset.browser_download_url),
        size: Number(asset.size || 0),
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

/**
 * 下载二进制内容，统一返回 base64 字符串
 *
 * 原生端 CapacitorHttp 对二进制（responseType: 'blob'）返回的是 base64 文本
 * （见 Android HttpRequestHandler#readStreamAsBase64，且 Base64.DEFAULT 会插换行）。
 * 曾经把这段 base64 直接喂给 new Blob([data])，等于把文本当二进制写盘，
 * 安装时系统读不到 packageInfo，报「解析软件包时出现问题 (33)」。
 * 所以这里统一按 base64 流转：写盘时 Filesystem 正好也吃 base64，零转换。
 *
 * @param {string} url
 * @returns {Promise<string>} 去掉空白字符的 base64
 */
async function fetchBinary(url) {
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.request({
      url,
      method: 'GET',
      responseType: 'blob',
      connectTimeout: 15000,
      // 11MB 在慢速镜像上可能需要一两分钟
      readTimeout: 180000,
    });

    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}`);
    }

    if (typeof response.data === 'string') {
      return response.data.replace(/\s+/g, '');
    }

    return blobToBase64(response.data);
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return blobToBase64(await response.blob());
}

/**
 * base64 对应的字节数（不真正解码，避免多一份内存）
 *
 * @param {string} base64
 * @returns {number}
 */
function base64Size(base64) {
  const pad = base64.endsWith('==') ? 2 : (base64.endsWith('=') ? 1 : 0);

  return Math.floor((base64.length * 3) / 4) - pad;
}

/**
 * 依次尝试镜像与直连，返回第一份完整的安装包
 *
 * @param {string} apkUrl GitHub 原始下载地址
 * @param {{onSource?: (name: string) => void, expectedSize?: number}} [options]
 * @returns {Promise<{base64: string, size: number, source: string}>}
 */
export async function downloadApk(apkUrl, { onSource, expectedSize = 0 } = {}) {
  let lastError = new Error('下载失败');

  for (const source of sources(apkUrl)) {
    try {
      onSource?.(source.name);

      const base64 = await fetchBinary(source.url);

      if (!base64) {
        throw new Error('下载内容为空');
      }

      // 镜像限流时常常返回 HTML 提示页，状态码却是 200，只能靠文件头识别
      if (!base64.startsWith(APK_MAGIC)) {
        throw new Error('下载内容不是安装包');
      }

      const size = base64Size(base64);

      if (size < APK_MIN_SIZE) {
        throw new Error('安装包不完整');
      }

      // 与 release 里声明的大小比对，拦住被截断的下载
      if (expectedSize > 0 && Math.abs(size - expectedSize) > expectedSize * 0.01) {
        throw new Error(`安装包不完整（${size}/${expectedSize} 字节）`);
      }

      return { base64, size, source: source.name };
    } catch (error) {
      // 单个源失败（超时 / 403 / 返回错误页）继续试下一个
      lastError = error;
    }
  }

  throw lastError;
}

/**
 * Blob 转 base64
 *
 * 浏览器预览端拿到的就是 Blob，转完交给同一套 base64 流程。
 *
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || '');
      const index = result.indexOf(',');
      resolve(index >= 0 ? result.slice(index + 1) : '');
    };

    reader.onerror = () => reject(new Error('读取下载内容失败'));
    reader.readAsDataURL(blob);
  });
}

/**
 * base64 还原成 Blob：只有浏览器预览端需要（原生端直接给 FileOpener 文件 URI）
 *
 * @param {string} base64
 * @returns {Blob}
 */
function base64ToBlob(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new Blob([bytes], { type: APK_MIME });
}

/**
 * 安装包文件名带上版本号
 *
 * 旧版本下载过的坏包不会命中，也不必猜它是否完整。
 *
 * @param {string} [version]
 * @returns {string}
 */
function apkFileName(version) {
  return version ? `sxlb-writer-${version.replace(/[^\d.]/g, '')}.apk` : APK_NAME;
}

/**
 * 把安装包写入缓存目录
 *
 * 直接写 base64：Filesystem 的原生实现本来就接受 base64，
 * 省掉「解码成二进制再重新编码」的一次完整拷贝（11MB 不便宜）。
 *
 * @param {string} base64
 * @param {string} [version]
 * @returns {Promise<string>} 文件 URI
 */
export async function saveApk(base64, version) {
  if (!base64) {
    throw new Error('安装包内容为空');
  }

  const path = apkFileName(version);

  await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });

  // 写盘后再核一次：文件系统报错被吞掉时，这里能兜住
  const info = await Filesystem.stat({ path, directory: Directory.Cache });

  if (!info || Number(info.size) < APK_MIN_SIZE) {
    throw new Error('安装包写入失败，请重试');
  }

  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });

  return uri;
}

/**
 * 缓存里是否已有对应版本的安装包
 *
 * @param {string} [version]
 * @returns {Promise<string>} 存在时返回 URI，否则空串
 */
export async function findSavedApk(version) {
  const path = apkFileName(version);

  try {
    const info = await Filesystem.stat({ path, directory: Directory.Cache });

    if (!info || Number(info.size) < APK_MIN_SIZE) {
      return '';
    }

    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });

    return uri;
  } catch {
    return '';
  }
}

/**
 * 清掉早期版本留下的固定文件名坏包
 *
 * 那些包是用 base64 文本冒充二进制写进去的，留着只占空间。
 *
 * @returns {Promise<void>}
 */
export async function dropLegacyApk() {
  try {
    await Filesystem.deleteFile({ path: APK_NAME, directory: Directory.Cache });
  } catch {
    // 文件不存在或已被系统清理，无需处理
  }
}

/**
 * 拉起系统安装界面
 *
 * 首次安装会跳到「安装未知应用」授权页，授权后返回再点一次即可。
 *
 * @param {string} uri saveApk / findSavedApk 返回的文件 URI
 * @param {string} [base64] 浏览器环境没有文件 URI，用内存里的安装包还原
 */
export async function openApk(uri, base64) {
  if (Capacitor.isNativePlatform()) {
    if (!uri) {
      throw new Error('安装包路径缺失');
    }

    await FileOpener.openFile({ path: uri, mimeType: APK_MIME });
    return;
  }

  if (!base64) {
    throw new Error('当前环境无法直接安装');
  }

  await FileOpener.openFile({ blob: base64ToBlob(base64) });
}

export { APK_MIME };
