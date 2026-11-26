import { readFileSync, writeFileSync } from 'node:fs';

/**
 * CI 里 `npx cap add android` 生成的工程版本号固定是 1.0，
 * 且默认调试签名路径不确定（actions/cache 会失效、AGP 可能重新生成），
 * 这里统一改成 package.json 的版本 + 仓库内固定密钥，保证可覆盖安装。
 */
const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));

// 只接受 x.y.z：预发布后缀会让 versionCode 变成 NaN
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) {
  throw new Error(`package.json 版本号必须是 x.y.z：${pkg.version}`);
}

const [major, minor, patch] = pkg.version.split('.').map(Number);
const versionCode = major * 10000 + minor * 100 + patch;

const gradlePath = 'android/app/build.gradle';
let gradle = readFileSync(gradlePath, 'utf-8');

gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}"`);

// replace 未命中时不能静默继续，否则会产出 versionCode 1 的包导致无法覆盖安装
if (!gradle.includes(`versionCode ${versionCode}`) || !gradle.includes(`versionName "${pkg.version}"`)) {
  throw new Error('写入版本号失败：android/app/build.gradle 模板可能已变化');
}

if (!gradle.includes('.github/debug.keystore')) {
  gradle = gradle.replace(
    /\nandroid \{/,
    `
android {
    signingConfigs {
        debug {
            storeFile rootProject.file('../.github/debug.keystore')
            storeType 'JKS'
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
    }`,
  );
}

writeFileSync(gradlePath, gradle);
console.log(`android/app/build.gradle -> versionName ${pkg.version}, versionCode ${versionCode}, 固定签名已写入`);

/**
 * 应用内更新需要拉起系统安装器，必须声明 REQUEST_INSTALL_PACKAGES。
 * cap add android 每次重新生成的模板里没有这一行，只能在这里补。
 */
const manifestPath = 'android/app/src/main/AndroidManifest.xml';
let manifest = readFileSync(manifestPath, 'utf-8');

if (!manifest.includes('REQUEST_INSTALL_PACKAGES')) {
  const permission = '    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />';

  if (/<uses-permission[^>]*\/>/.test(manifest)) {
    manifest = manifest.replace(/<uses-permission[^>]*\/>/, (tag) => `${tag}\n${permission}`);
  } else {
    manifest = manifest.replace('<application', `${permission}\n\n    <application`);
  }

  writeFileSync(manifestPath, manifest);
}

if (!readFileSync(manifestPath, 'utf-8').includes('REQUEST_INSTALL_PACKAGES')) {
  throw new Error('写入安装权限失败：AndroidManifest.xml 模板可能已变化');
}

console.log('AndroidManifest.xml -> REQUEST_INSTALL_PACKAGES 已写入');
