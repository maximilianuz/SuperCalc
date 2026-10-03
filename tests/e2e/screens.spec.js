// Capturas a 412 px en claro y oscuro (docs/capturas/) y control de scroll horizontal a 360 px.
import { test, expect } from '@playwright/test';
import { openOffline, renderLabel, filePayload, painter } from './helpers.js';

const DAY = 86_400_000;
const NOW = new Date('2026-10-03T11:00:00-03:00').getTime();

function seed() {
  const items = [
    { id: 'a', name: 'Yerba Playadito 1 kg', code: '', cents: 425000, qty: 1, pending: null, cmp: { kind: 'up', pct: 8.2, prev: 392800, since: 0 }, rec: null, addedAt: 1 },
    { id: 'b', name: 'Leche La Serenísima 1 l', code: '', cents: 108200, qty: 3, pending: null, cmp: { kind: 'down', pct: -4.1, prev: 112800, since: 0 }, rec: null, addedAt: 2 },
    { id: 'c', name: 'Queso cremoso', code: '', cents: 999000, qty: 1, pending: ['medida'], cmp: null, rec: null, addedAt: 3 },
    { id: 'd', name: '', code: '', cents: 85000, qty: 2, pending: null, cmp: null, rec: null, addedAt: 4 },
    { id: 'e', name: 'Aceite de girasol Natura 1,5 l con nombre largo', code: '', cents: 289000, qty: 1, pending: null, cmp: null, rec: null, addedAt: 5 },
    { id: 'f', name: 'Arroz Gallo Oro 1 kg', code: '', cents: 159900, qty: 2, pending: null, cmp: null, rec: null, addedAt: 6 },
    { id: 'g', name: 'Fideos Matarazzo 500 g', code: '', cents: 185000, qty: 1, pending: null, cmp: null, rec: null, addedAt: 7 },
    { id: 'h', name: 'Galletitas Oreo 118 g', code: '', cents: 345000, qty: 1, pending: null, cmp: null, rec: null, addedAt: 8 },
  ];
  return { items, limit: 3600000 };
}

function seedHist(now) {
  const DAY = 86_400_000;
  const pts = (arr) => arr.map(([c, d]) => ({ c, t: now - d * DAY, s: now - d * DAY + DAY }));
  return {
    v: 1,
    products: {
      'n:yerba playadito 1 kg': { key: 'n:yerba playadito 1 kg', name: 'Yerba Playadito 1 kg', code: '', points: pts([[350000, 120], [365000, 90], [392800, 40], [425000, 0]]) },
      'n:leche la serenisima 1 l': { key: 'n:leche la serenisima 1 l', name: 'Leche La Serenísima 1 l', code: '', points: pts([[98000, 60], [112800, 30], [108200, 0]]) },
      'c:7790580000011': { key: 'c:7790580000011', name: 'Mermelada Arcor', code: '7790580000011', points: pts([[200000, 10]]) },
    },
  };
}

async function noHorizontalScroll(page, label) {
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const out = { doc: doc.scrollWidth - doc.clientWidth, dialogs: [] };
    for (const d of document.querySelectorAll('dialog[open]')) {
      for (const el of [d, ...d.querySelectorAll('.sheet-scroll')]) out.dialogs.push(el.scrollWidth - el.clientWidth);
    }
    return out;
  });
  expect(r.doc, `${label}: scroll horizontal en la página`).toBeLessThanOrEqual(0);
  for (const x of r.dialogs) expect(x, `${label}: scroll horizontal en un diálogo`).toBeLessThanOrEqual(0);
}

for (const scheme of ['light', 'dark']) {
  test(`capturas ${scheme}`, async ({ page, context }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.clock.setFixedTime(NOW);
    await page.addInitScript(
      ({ list, hist }) => {
        if (!sessionStorage.getItem('sembrado')) {
          localStorage.setItem('compras.lista.v1', JSON.stringify(list));
          localStorage.setItem('compras.historial.v1', JSON.stringify(hist));
          sessionStorage.setItem('sembrado', '1');
        }
      },
      { list: seed(), hist: seedHist(NOW) },
    );
    await openOffline(page, context);
    const shot = (name) => page.screenshot({ path: `docs/capturas/${scheme}-${name}.png` });
    await page.evaluate(() => document.fonts.ready);

    await shot('1-lista');
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(150);
    await expect(page.locator('#total-card')).toHaveClass(/stuck/);
    await shot('2-lista-scroll');
    await page.evaluate(() => window.scrollTo(0, 0));

    // Pasado del límite
    await page.click('#btn-manual');
    await page.fill('#f-name', 'Vino Malbec');
    await page.fill('#f-price', '9900');
    await shot('3-hoja-agregar');
    await page.click('#btn-item-save');
    await expect(page.locator('#total-card')).toHaveClass(/over/);
    await shot('4-limite-pasado');

    // Hoja con candidatos de la foto
    const p = await painter(context);
    const b64 = await renderLabel(p, {
      items: [
        { text: 'PRECIO MAYORISTA', x: 60, y: 90, size: 56 },
        { text: '$ 2.890', x: 60, y: 380, size: 220 },
        { text: 'Precio sin impuestos nacionales $ 2.388,43', x: 60, y: 560, size: 42, weight: 500 },
      ],
    });
    await p.close();
    await page.setInputFiles('#file-photo', filePayload('l.png', b64));
    await expect(page.locator('#item-busy')).toBeHidden({ timeout: 120_000 });
    await page.locator('#cands .chip.suggested').click();
    await shot('5-hoja-foto');
    await noHorizontalScroll(page, 'hoja foto 412');
    await page.locator('#sheet-item [data-close]').click();

    await page.click('#btn-history');
    await shot('6-historial');
    await page.locator('.prod', { hasText: 'Yerba' }).click();
    await shot('7-historial-detalle');
    await page.locator('#sheet-history [data-close]').click();

    await page.click('#btn-clear');
    await shot('8-vaciar');
    await page.click('#confirm-cancel');

    // 360 px: sin scroll horizontal en ninguna pantalla
    await page.setViewportSize({ width: 360, height: 760 });
    await noHorizontalScroll(page, 'lista 360');
    await page.click('#btn-manual');
    await noHorizontalScroll(page, 'hoja 360');
    await page.locator('#sheet-item [data-close]').click();
    await page.click('#btn-history');
    await noHorizontalScroll(page, 'historial 360');
    await page.locator('.prod', { hasText: 'Yerba' }).click();
    await noHorizontalScroll(page, 'detalle 360');
    await page.screenshot({ path: `docs/capturas/${scheme}-9-detalle-360.png` });
    await page.locator('#sheet-history [data-close]').click();
    await page.click('#btn-limit');
    await noHorizontalScroll(page, 'límite 360');
    await page.locator('#sheet-limit [data-close]').click();
    await page.screenshot({ path: `docs/capturas/${scheme}-10-lista-360.png` });
  });
}

test('a 360 px los textos de la barra inferior y los avisos entran completos', async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await openOffline(page, context);
  for (const id of ['#btn-photo', '#btn-code', '#btn-manual']) {
    const fits = await page.locator(`${id} span`).evaluate((e) => e.scrollWidth <= e.clientWidth);
    expect(fits, `${id} cortado`).toBe(true);
  }
  await page.click('#btn-limit');
  await page.fill('#f-limit', '1');
  await page.click('#btn-limit-save');
  await page.click('#btn-manual');
  await page.fill('#f-price', '123456,78');
  await page.click('#btn-item-save');
  const box = await page.locator('#toast-host .toast').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
});

test('prefers-reduced-motion anula las animaciones de las hojas', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openOffline(page, context);
  await page.click('#btn-manual');
  const dur = await page.locator('#sheet-item').evaluate((e) => parseFloat(getComputedStyle(e).animationDuration));
  expect(dur).toBeLessThan(0.01);
  await page.locator('#sheet-item [data-close]').click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.click('#btn-manual');
  const dur2 = await page.locator('#sheet-item').evaluate((e) => parseFloat(getComputedStyle(e).animationDuration));
  expect(dur2).toBeGreaterThan(0.1);
});
