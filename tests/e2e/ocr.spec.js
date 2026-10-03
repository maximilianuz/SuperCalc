import { test, expect } from '@playwright/test';
import { openOffline, renderLabel, filePayload, painter } from './helpers.js';

const LABELS = {
  grande: {
    items: [
      { text: 'Yerba Mate Playadito 1 kg', x: 60, y: 110, size: 54, weight: 600 },
      { text: '$', x: 60, y: 430, size: 150 },
      { text: '4.250', x: 190, y: 470, size: 260 },
    ],
  },
  mayoristaArriba: {
    band: { y: 0, h: 150, color: '#1d4ed8' },
    items: [
      { text: 'PRECIO MAYORISTA', x: 60, y: 105, size: 70, color: '#ffffff' },
      { text: '$ 1.850', x: 60, y: 420, size: 230 },
      { text: 'Fideos Matarazzo 500 g', x: 60, y: 600, size: 50, weight: 500 },
    ],
  },
  porKg: {
    items: [
      { text: 'Queso cremoso', x: 60, y: 120, size: 64, weight: 600 },
      { text: '$ 9.990', x: 60, y: 430, size: 220 },
      { text: 'x kg', x: 860, y: 430, size: 90 },
    ],
  },
  sinImpuestos: {
    items: [
      { text: 'Aceite Natura 900 ml', x: 60, y: 110, size: 56, weight: 600 },
      { text: '$ 2.890', x: 60, y: 420, size: 230 },
      { text: 'Precio sin impuestos nacionales $ 2.388,43', x: 60, y: 600, size: 42, weight: 500 },
    ],
  },
  fondoColor: {
    bg: '#facc15',
    ink: '#b91c1c',
    items: [
      { text: 'Arroz Gallo Oro 1 kg', x: 60, y: 120, size: 60, weight: 700, color: '#111111' },
      { text: '$ 1.599', x: 60, y: 450, size: 240 },
    ],
  },
  girada: {
    rotate: 5,
    items: [
      { text: 'Galletitas Oreo 118 g', x: 60, y: 120, size: 58, weight: 600 },
      { text: '$ 3.450', x: 60, y: 440, size: 230 },
    ],
  },
  sinPrecio: {
    items: [
      { text: 'Almacén de barrio', x: 60, y: 200, size: 80 },
      { text: 'Gracias por su compra', x: 60, y: 420, size: 64, weight: 500 },
    ],
  },
};

async function scan(page, context, label) {
  const p = await painter(context);
  const b64 = await renderLabel(p, LABELS[label]);
  await p.close();
  await page.setInputFiles('#file-photo', filePayload(`${label}.png`, b64));
  await expect(page.locator('#sheet-item')).toBeVisible();
  await expect(page.locator('#item-busy')).toBeHidden({ timeout: 120_000 });
  await expect(page.locator('#cands .chip, #scan-msg:not([hidden])').first()).toBeVisible();
}

const chips = (page) => page.locator('#cands .chip');

test('precio grande: sugiere el precio y nada se agrega sin confirmar', async ({ page, context }) => {
  await openOffline(page, context);
  await scan(page, context, 'grande');
  const sug = page.locator('#cands .chip.suggested');
  await expect(sug).toHaveCount(1);
  await expect(sug.locator('b')).toHaveText('$ 4.250,00');
  await expect(sug).toContainText('Sugerido');
  // No se rellenó ni agregó nada todavía
  await expect(page.locator('#f-price')).toHaveValue('');
  await expect(page.locator('.item')).toHaveCount(0);
  await sug.click();
  await expect(page.locator('#f-price')).toHaveValue('4250');
  await page.click('#btn-item-save');
  await expect(page.locator('.item')).toHaveCount(1);
  await expect(page.locator('#total-amount')).toHaveText('$ 4.250,00');
});

test('mayorista arriba: sugiere igual, con advertencia (regla cercana)', async ({ page, context }) => {
  await openOffline(page, context);
  await scan(page, context, 'mayoristaArriba');
  await expect(page.locator('#cands .chip.suggested b')).toHaveText('$ 1.850,00');
  await expect(page.locator('#scan-warn')).toContainText('mayorista');
  await page.locator('#cands .chip.suggested').click();
  await expect(page.locator('#f-pending')).toBeHidden();
});

test('por kg: no sugiere y el elegido queda «A confirmar» (no entra al historial)', async ({ page, context }) => {
  await openOffline(page, context);
  await scan(page, context, 'porKg');
  await expect(page.locator('#cands .chip.suggested')).toHaveCount(0);
  const chip = chips(page).filter({ hasText: '$ 9.990,00' });
  await expect(chip).toContainText('A confirmar · por medida');
  await expect(page.locator('#scan-warn')).toContainText('condiciones');
  await page.fill('#f-name', 'Queso cremoso');
  await chip.click();
  await expect(page.locator('#f-pending')).toBeVisible();
  await expect(page.locator('#f-pending')).toContainText('unidad de medida');
  await page.click('#btn-item-save');
  await expect(page.locator('.item .tag.warn')).toHaveText('A confirmar');
  const keys = await page.evaluate(() => Object.keys(window.__compras.hist.products));
  expect(keys).toEqual([]);

  // Confirmarlo después sí lo guarda en el historial
  await page.locator('.item-main').click();
  await page.click('#btn-confirm-price');
  await page.click('#btn-item-save');
  await expect(page.locator('.item .tag.warn')).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(window.__compras.hist.products))).toEqual(['n:queso cremoso']);
});

test('sin impuestos: sugiere el precio final y marca el precio sin impuestos', async ({ page, context }) => {
  await openOffline(page, context);
  await scan(page, context, 'sinImpuestos');
  await expect(page.locator('#cands .chip.suggested b')).toHaveText('$ 2.890,00');
  await expect(chips(page).filter({ hasText: '$ 2.388,43' })).toContainText('sin impuestos');
});

test('fondo de color: lee el precio', async ({ page, context }) => {
  await openOffline(page, context);
  await scan(page, context, 'fondoColor');
  await expect(page.locator('#cands .chip.suggested b')).toHaveText('$ 1.599,00');
});

test('etiqueta girada: lee el precio', async ({ page, context }) => {
  await openOffline(page, context);
  await scan(page, context, 'girada');
  await expect(page.locator('#cands .chip.suggested b')).toHaveText('$ 3.450,00');
});

test('etiqueta girada −10°: lee el precio', async ({ page, context }) => {
  LABELS.giradaMas = { ...LABELS.girada, rotate: -10 };
  await openOffline(page, context);
  await scan(page, context, 'giradaMas');
  await expect(page.locator('#cands .chip.suggested b')).toHaveText('$ 3.450,00');
});

test('sin precio: lo dice y pide cargarlo a mano', async ({ page, context }) => {
  await openOffline(page, context);
  await scan(page, context, 'sinPrecio');
  await expect(page.locator('#scan-msg')).toContainText('No encontramos ningún precio');
  await expect(page.locator('#scan-box')).toBeHidden();
  await expect(page.locator('#f-price')).toBeFocused();
});

test('«Leer precio con foto» desde la hoja no pierde lo cargado', async ({ page, context }) => {
  await openOffline(page, context);
  await page.click('#btn-manual');
  await page.fill('#f-name', 'Aceite Natura');
  await page.click('#f-plus');
  const p = await painter(context);
  const b64 = await renderLabel(p, LABELS.sinImpuestos);
  await p.close();
  const chooser = page.waitForEvent('filechooser');
  await page.click('#btn-item-photo');
  await (await chooser).setFiles(filePayload('x.png', b64));
  await expect(page.locator('#item-busy')).toBeHidden({ timeout: 120_000 });
  await expect(page.locator('#f-name')).toHaveValue('Aceite Natura');
  await expect(page.locator('#f-qty')).toHaveText('2');
  await page.locator('#cands .chip.suggested').click();
  await page.click('#btn-item-save');
  await expect(page.locator('#total-amount')).toHaveText('$ 5.780,00');
});

test('ningún pedido sale de localhost (app, worker de OCR, core e idioma)', async ({ page, context }) => {
  const external = [];
  const seen = [];
  context.on('request', (r) => {
    seen.push(r.url());
    if (!/^(http:\/\/localhost:4173\/|data:|blob:)/.test(r.url())) external.push(r.url());
  });
  await openOffline(page, context);
  await scan(page, context, 'grande');
  await expect(page.locator('#cands .chip.suggested b')).toHaveText('$ 4.250,00');
  expect(external).toEqual([]);
  expect(seen.some((u) => u.endsWith('/ocr/spa.traineddata.gz'))).toBe(true);
  expect(seen.some((u) => u.endsWith('/ocr/tesseract-core-simd-lstm.wasm.js'))).toBe(true);
});

test('respaldo: sin SIMD usa el core común y lee igual', async ({ page, context }) => {
  const seen = [];
  context.on('request', (r) => seen.push(r.url()));
  await page.addInitScript(() => {
    const orig = WebAssembly.validate;
    // El módulo de prueba de SIMD tiene 31 bytes: simulamos un dispositivo sin SIMD
    WebAssembly.validate = (bytes) => (bytes && bytes.length === 31 ? false : orig(bytes));
  });
  await openOffline(page, context);
  await scan(page, context, 'grande');
  await expect(page.locator('#cands .chip.suggested b')).toHaveText('$ 4.250,00');
  expect(seen.some((u) => u.endsWith('/ocr/tesseract-core-lstm.wasm.js'))).toBe(true);
  expect(seen.some((u) => u.endsWith('/ocr/tesseract-core-simd-lstm.wasm.js'))).toBe(false);
});
