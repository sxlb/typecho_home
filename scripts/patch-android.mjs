import { readFileSync, writeFileSync } from 'node:fs';

/**
 * CI 里 `npx cap add android` 生成的工程版本号固定是 1.0，
 * 且默认调试签名路径不确定（actions/cache 会失效、AGP 可能重新生成），
 * 这里统一改成 package.json 的版本 + 仓库内固定密钥，保证可覆盖安装。
 */
const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
const versionCode = major * 10000 + minor * 100 + patch;

const gradlePath = 'android/app/build.gradle';
let gradle = readFileSync(gradlePath, 'utf-8');

gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}"`);

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
