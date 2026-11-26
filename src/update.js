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
 * 下载二进制内容
 *
 * @param {string} url
 * @returns {Promise<Blob>}
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

    return response.data instanceof Blob ? response.data : new Blob([response.data]);
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.blob();
}

/**
 * 依次尝试直连与镜像，返回第一份成功的安装包
 *
 * @param {string} apkUrl GitHub 原始下载地址
 * @param {{onSource?: (name: string) => void}} [options]
 * @returns {Promise<{blob: Blob, source: string}>}
 */
export async function downloadApk(apkUrl, { onSource } = {}) {
  let lastError = new Error('下载失败');

  for (const source of sources(apkUrl)) {
    try {
      onSource?.(source.name);

      const blob = await fetchBinary(source.url);

      if (!blob || !blob.size) {
        throw new Error('下载内容为空');
      }

      return { blob, source: source.name };
    } catch (error) {
      // 单个源失败（超时 / 403 / 被劫持）继续试下一个
      lastError = error;
    }
  }

  throw lastError;
}

/**
 * Blob 转 base64：Filesystem 只接受 base64 字符串
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
 * 把安装包写入缓存目录
 *
 * 写盘而不是一直放在内存里：用户切后台、WebView 被回收后，
 * 回到前台仍能直接拉起安装，不必重新下载。
 *
 * @param {Blob} blob
 * @returns {Promise<string>} 文件 URI
 */
export async function saveApk(blob) {
  const data = await blobToBase64(blob);

  await Filesystem.writeFile({
    path: APK_NAME,
    data,
    directory: Directory.Cache,
    recursive: true,
  });

  const { uri } = await Filesystem.getUri({ path: APK_NAME, directory: Directory.Cache });

  return uri;
}

/**
 * 缓存里是否已有上次下载的安装包
 *
 * @returns {Promise<string>} 存在时返回 URI，否则空串
 */
export async function findSavedApk() {
  try {
    const { uri } = await Filesystem.getUri({ path: APK_NAME, directory: Directory.Cache });
    const info = await Filesystem.stat({ path: APK_NAME, directory: Directory.Cache });

    return info && Number(info.size) > 0 ? uri : '';
  } catch {
    return '';
  }
}

/**
 * 拉起系统安装界面
 *
 * 首次安装会跳到「安装未知应用」授权页，授权后返回再点一次即可。
 *
 * @param {string} uri saveApk / findSavedApk 返回的文件 URI
 * @param {Blob} [blob] 浏览器环境没有文件 URI，直接用内存里的 Blob
 */
export async function openApk(uri, blob) {
  if (Capacitor.isNativePlatform()) {
    if (!uri) {
      throw new Error('安装包路径缺失');
    }

    await FileOpener.openFile({ path: uri, mimeType: APK_MIME });
    return;
  }

  if (!blob) {
    throw new Error('当前环境无法直接安装');
  }

  await FileOpener.openFile({ blob });
}

export { APK_MIME };
