// Utilidades para las pruebas end-to-end: etiquetas sintéticas, códigos de barras, modo sin red.
import bwipjs from 'bwip-js';
import { expect } from '@playwright/test';

export function eanWithCheck(body) {
  const d = body.split('').map(Number);
  let sum = 0;
  for (let i = d.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += d[i] * w;
  return body + ((10 - (sum % 10)) % 10);
}

export async function barcodePNG(bcid, text, scale = 3) {
  const buf = await bwipjs.toBuffer({ bcid, text, scale, height: 18, includetext: true, textxalign: 'center', backgroundcolor: 'FFFFFF' });
  return buf.toString('base64');
}

// Dibuja una "foto" (lienzo grande con fondo gris) con una etiqueta en el centro.
// spec: { w, h, bg, ink, rotate, photoW, photoH, items: [{ text, x, y, size, weight, color, font }],
//         barcode: { b64, x, y, w } , band: { y, h, color } }
// Devuelve un PNG en base64.
export async function renderLabel(page, spec) {
  return page.evaluate(async (spec) => {
    const photoW = spec.photoW || 1600;
    const photoH = spec.photoH || 1200;
    const c = document.createElement('canvas');
    c.width = photoW;
    c.height = photoH;
    const ctx = c.getContext('2d');
    // Fondo tipo góndola con ruido leve
    ctx.fillStyle = spec.photoBg || '#9aa0a6';
    ctx.fillRect(0, 0, photoW, photoH);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`;
      ctx.fillRect(rnd() * photoW, rnd() * photoH, 3, 3);
    }
    const w = spec.w || 1100;
    const h = spec.h || 760;
    ctx.save();
    ctx.translate(photoW / 2, photoH / 2);
    ctx.rotate(((spec.rotate || 0) * Math.PI) / 180);
    ctx.translate(-w / 2, -h / 2);
    ctx.fillStyle = spec.bg || '#ffffff';
    ctx.fillRect(0, 0, w, h);
    if (spec.band) {
      ctx.fillStyle = spec.band.color;
      ctx.fillRect(0, spec.band.y, w, spec.band.h);
    }
    for (const it of spec.items || []) {
      ctx.fillStyle = it.color || spec.ink || '#111';
      ctx.font = `${it.weight || 700} ${it.size}px ${it.font || '"Liberation Sans", "DejaVu Sans", sans-serif'}`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(it.text, it.x, it.y);
    }
    if (spec.barcode) {
      const img = new Image();
      img.src = `data:image/png;base64,${spec.barcode.b64}`;
      await img.decode();
      const bw = spec.barcode.w || img.width;
      const bh = (img.height * bw) / img.width;
      ctx.drawImage(img, spec.barcode.x, spec.barcode.y, bw, bh);
    }
    ctx.restore();
    return c.toDataURL('image/png').split(',')[1];
  }, spec);
}

// Imagen que es solo un código de barras sobre fondo blanco (opcionalmente rotada 90°).
export async function renderBarcodePhoto(page, b64, { rotate = 0, photoW = 1200, photoH = 900, w = null } = {}) {
  return page.evaluate(
    async ({ b64, rotate, photoW, photoH, w }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = photoW;
      c.height = photoH;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#f4f4f0';
      ctx.fillRect(0, 0, photoW, photoH);
      const bw = w || img.width;
      const bh = (img.height * bw) / img.width;
      ctx.translate(photoW / 2, photoH / 2);
      ctx.rotate((rotate * Math.PI) / 180);
      ctx.drawImage(img, -bw / 2, -bh / 2, bw, bh);
      return c.toDataURL('image/png').split(',')[1];
    },
    { b64, rotate, photoW, photoH, w },
  );
}

export function filePayload(name, b64) {
  return { name, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

// Carga la app, espera a que el service worker controle la página y corta la red.
export async function openOffline(page, context) {
  await page.addInitScript(() => {
    window.__vibrations = [];
    navigator.vibrate = (p) => {
      window.__vibrations.push(p);
      return true;
    };
    window.confirm = () => {
      throw new Error('No se debe usar confirm()');
    };
    window.alert = () => {
      throw new Error('No se debe usar alert()');
    };
  });
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
  });
  await context.setOffline(true);
  // Recargar sin red: todo tiene que salir del service worker
  await page.reload();
  await expect(page.locator('#total-amount')).toBeVisible();
}

// Genera imágenes en una pestaña aparte (para no tocar la app)
export async function painter(context) {
  const p = await context.newPage();
  await p.setContent('<!doctype html><title>pintor</title>');
  return p;
}

// Recarga cuando no queda un history.back() pendiente de haber cerrado una hoja
// (si no, el back pendiente se ejecuta sobre el documento nuevo y provoca otra navegación).
export async function reloadSettled(page) {
  await page.waitForFunction(() => !(history.state && history.state.comprasModal));
  await page.waitForTimeout(50);
  await page.reload();
}
