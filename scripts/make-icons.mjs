// Genera los íconos de la app (PWA y Android) a partir de un SVG.
// Fondo #101828, tarjeta blanca y «$». Requiere Playwright + Chromium (solo en desarrollo).
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const font = readFileSync(join(root, 'www/fonts/Geist-Variable.woff2')).toString('base64');

// card: tamaño de la tarjeta relativo al lienzo; shape: square | round | none (fondo transparente)
function svg({ card = 0.56, shape = 'square' }) {
  const s = 1024;
  const c = s * card;
  const x = (s - c) / 2;
  const bg =
    shape === 'none'
      ? ''
      : shape === 'round'
        ? `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="#101828"/>`
        : `<rect width="${s}" height="${s}" fill="#101828"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">
    ${bg}
    <rect x="${x}" y="${x}" width="${c}" height="${c}" rx="${c * 0.22}" fill="#ffffff"/>
    <text x="${s / 2}" y="${s / 2}" dy="0.355em" text-anchor="middle" font-family="Geist" font-weight="700" font-size="${c * 0.7}" fill="#101828">$</text>
  </svg>`;
}

const targets = [
  ['www/icons/icon-192.png', 192, { card: 0.56 }],
  ['www/icons/icon-512.png', 512, { card: 0.56 }],
  ['www/icons/maskable-512.png', 512, { card: 0.46 }],
  ['assets/icon-1024.png', 1024, { card: 0.56 }],
];
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(dens)) {
  targets.push([`assets/android/mipmap-${d}/ic_launcher.png`, 48 * k, { card: 0.56 }]);
  targets.push([`assets/android/mipmap-${d}/ic_launcher_round.png`, 48 * k, { card: 0.5, shape: 'round' }]);
  // Ícono adaptativo: lienzo de 108 dp, zona segura central de 66 dp
  targets.push([`assets/android/mipmap-${d}/ic_launcher_foreground.png`, 108 * k, { card: 0.4, shape: 'none' }]);
}

// Pantalla de inicio (Android ≤ 11): tarjeta centrada sobre #101828
function splash(w, h) {
  const c = Math.min(w, h) * 0.22;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
    <rect width="${w}" height="${h}" fill="#101828"/>
    <rect x="${(w - c) / 2}" y="${(h - c) / 2}" width="${c}" height="${c}" rx="${c * 0.22}" fill="#fff"/>
    <text x="${w / 2}" y="${h / 2}" dy="0.355em" text-anchor="middle" font-family="Geist" font-weight="700" font-size="${c * 0.7}" fill="#101828">$</text>
  </svg>`;
}

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [out, size, opts] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<!doctype html><style>
    @font-face{font-family:Geist;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}
    html,body{margin:0;background:transparent} svg{display:block;width:${size}px;height:${size}px}
  </style>${svg(opts)}`);
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(join(root, dirname(out)), { recursive: true });
  await page.screenshot({ path: join(root, out), omitBackground: true });
  console.log(out, size);
}
for (const [out, w, h] of [
  ['assets/android/splash-port.png', 1080, 1920],
  ['assets/android/splash-land.png', 1920, 1080],
]) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><style>
    @font-face{font-family:Geist;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}
    html,body{margin:0} svg{display:block}
  </style>${splash(w, h)}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(root, out) });
  console.log(out);
}
await browser.close();
