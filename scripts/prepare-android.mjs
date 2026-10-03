// Prepara el proyecto Android de Capacitor. Se puede correr las veces que haga falta.
//  1. `cap add android` si todavía no existe la carpeta android/, y `cap sync android`.
//  2. Permiso de cámara (CAMERA) + uses-feature camera required=false en el manifest.
//  3. Íconos y pantalla de inicio propios.
//  4. Firma de depuración con el keystore fijo del repo (signing/debug.keystore) y versionCode.
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const android = join(root, 'android');
const res = join(android, 'app/src/main/res');
const run = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit' });

if (!existsSync(android)) run('npx cap add android');
run('npx cap sync android');

// --- Manifest ---
const manifestPath = join(android, 'app/src/main/AndroidManifest.xml');
let manifest = readFileSync(manifestPath, 'utf8');
const additions = [
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-feature android:name="android.hardware.camera" android:required="false" />',
];
for (const line of additions) {
  if (!manifest.includes(line)) manifest = manifest.replace('</manifest>', `    ${line}\n</manifest>`);
}
writeFileSync(manifestPath, manifest);

// --- Íconos ---
const iconSrc = join(root, 'assets/android');
for (const dir of readdirSync(iconSrc).filter((d) => d.startsWith('mipmap-'))) {
  for (const f of readdirSync(join(iconSrc, dir))) copyFileSync(join(iconSrc, dir, f), join(res, dir, f));
}
writeFileSync(
  join(res, 'values/ic_launcher_background.xml'),
  '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#101828</color>\n</resources>\n',
);

// --- Pantalla de inicio ---
for (const dir of readdirSync(res).filter((d) => d.startsWith('drawable'))) {
  const target = join(res, dir, 'splash.png');
  if (!existsSync(target)) continue;
  copyFileSync(join(iconSrc, dir.includes('land') ? 'splash-land.png' : 'splash-port.png'), target);
}

// --- Gradle: firma fija y versión ---
const gradlePath = join(android, 'app/build.gradle');
let gradle = readFileSync(gradlePath, 'utf8');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const versionCode = Number.parseInt(process.env.VERSION_CODE || '1', 10) || 1;
gradle = gradle.replace(/versionCode \d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName "[^"]*"/, `versionName "${pkg.version}"`);
if (!gradle.includes('// compras:signing')) {
  gradle = gradle.replace(
    /android \{\n/,
    `android {
    // compras:signing — keystore de depuración fijo para poder instalar actualizaciones encima
    signingConfigs {
        debug {
            storeFile file('../../signing/debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
`,
  );
  gradle = gradle.replace(
    /buildTypes \{\n/,
    `buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
`,
  );
}
writeFileSync(gradlePath, gradle);

console.log(`Android listo (versionCode ${versionCode}, versionName ${pkg.version}).`);
