/**
 * 把 vditor 的静态资源复制到 public/vditor
 *
 * Vditor 运行时需要从 options.cdn 动态加载 lute、图标、表情等资源，
 * 打包进 App 可以避免依赖外部 CDN。
 */
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'node_modules/vditor/dist');
const target = resolve(root, 'public/vditor/dist');

if (!existsSync(source)) {
  console.warn('[copy-vditor] 未找到 node_modules/vditor，跳过');
  process.exit(0);
}

await rm(target, { recursive: true, force: true });
await mkdir(dirname(target), { recursive: true });
await cp(source, target, { recursive: true });

console.log('[copy-vditor] 已复制到 public/vditor/dist');
