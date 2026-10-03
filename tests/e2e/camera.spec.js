import { test, expect } from '@playwright/test';
import { openOffline, fakeCamera, renderLabel, renderBarcodePhoto, barcodePNG, eanWithCheck, painter } from './helpers.js';

const EAN13 = eanWithCheck('779038700016');
const DAY = 86_400_000;

async function barcodeOnly(context) {
  const p = await painter(context);
  const b64 = await renderBarcodePhoto(p, await barcodePNG('ean13', EAN13, 3));
  await p.close();
  return b64;
}

test('escaneo continuo: producto conocido se agrega con un toque y la cámara sigue abierta', async ({ page, context }) => {
  await fakeCamera(page);
  await page.addInitScript(
    ({ code, t }) => {
      if (sessionStorage.getItem('s')) return;
      const key = `c:${code}`;
      const hist = { v: 1, products: { [key]: { key, name: 'Yerba Playadito 1 kg', code, points: [{ c: 425000, t, s: t }] } } };
      localStorage.setItem('compras.historial.v1', JSON.stringify(hist));
      sessionStorage.setItem('s', '1');
    },
    { code: EAN13, t: Date.now() - 14 * DAY },
  );
  await openOffline(page, context);
  await page.evaluate((b) => window.__setFakeCam(b), await barcodeOnly(context));
  await page.click('#btn-scan');
  expect(await page.evaluate(() => window.__camConstraints.video.facingMode)).toEqual({ ideal: 'environment' });
  const card = page.locator('#cam-card');
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.locator('.cc-name')).toHaveText('Yerba Playadito 1 kg');
  await expect(card.locator('.cc-price')).toHaveText('$ 4.250,00');
  await expect(card).toContainText('último precio hace 2 semanas');
  await card.getByRole('button', { name: 'Sumar uno' }).click();
  await card.getByRole('button', { name: 'Añadir · $ 8.500,00' }).click();

  await expect(card).toBeHidden();
  await expect(page.locator('#sheet-camera')).toBeVisible();
  await expect(page.locator('#cam-total')).toHaveText('$ 8.500,00 · 1 artículo');
  await expect(page.locator('#sheet-camera .toast')).toContainText('Añadiste «Yerba Playadito 1 kg»');
  // El mismo código no vuelve a aparecer enseguida
  await page.waitForTimeout(1200);
  await expect(card).toBeHidden();

  await page.locator('#sheet-camera [data-close]').click();
  await expect(page.locator('#total-amount')).toHaveText('$ 8.500,00');
  await expect(page.locator('.item')).toHaveCount(1);
  await expect(page.locator('.item output')).toHaveText('2');
  expect(await page.evaluate(() => document.querySelector('#cam-video').srcObject)).toBe(null);
});

test('escaneo continuo: código nuevo, se lee el precio del cartel y se agrega', async ({ page, context }) => {
  await fakeCamera(page);
  await openOffline(page, context);
  const p = await painter(context);
  const b64 = await renderLabel(p, {
    w: 1200,
    h: 900,
    photoW: 1600,
    photoH: 1200,
    items: [
      { text: 'Yerba Playadito 1 kg', x: 60, y: 110, size: 56, weight: 600 },
      { text: '$ 4.250', x: 60, y: 400, size: 220 },
    ],
    barcode: { b64: await barcodePNG('ean13', EAN13, 3), x: 60, y: 520, w: 520 },
  });
  await p.close();
  await page.evaluate((b) => window.__setFakeCam(b), b64);
  await page.click('#btn-scan');
  const card = page.locator('#cam-card');
  await expect(card.locator('.cc-name')).toHaveText('Producto nuevo', { timeout: 15_000 });
  await expect(card).toContainText(`Código ${EAN13}`);
  await card.getByRole('button', { name: 'Leer precio' }).click();
  await expect(card.locator('.cc-price')).toHaveText('$ 4.250,00', { timeout: 120_000 });
  await expect(card).toContainText('Primera vez que lo cargás');
  await card.getByRole('button', { name: /^Añadir/ }).click();
  await expect(page.locator('#cam-total')).toHaveText('$ 4.250,00 · 1 artículo');

  // Deshacer desde la cámara
  await page.locator('#sheet-camera .toast').getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.locator('#cam-total')).toHaveText('Lista vacía');
  expect(await page.evaluate(() => Object.keys(window.__compras.hist.products).length)).toBe(0);
});

test('escaneo continuo: el disparador lee un cartel sin código y «Escribir» pasa todo a la hoja', async ({ page, context }) => {
  await fakeCamera(page);
  await openOffline(page, context);
  const p = await painter(context);
  const b64 = await renderLabel(p, { items: [{ text: '$ 2.890', x: 60, y: 420, size: 230 }] });
  await p.close();
  await page.evaluate((b) => window.__setFakeCam(b), b64);
  await page.click('#btn-scan');
  await expect(page.locator('#cam-shutter')).toBeEnabled();
  await page.click('#cam-shutter');
  const card = page.locator('#cam-card');
  await expect(card.locator('.cc-price')).toHaveText('$ 2.890,00', { timeout: 120_000 });
  await expect(card.locator('.cc-name')).toHaveText('Precio del cartel');
  await card.getByRole('button', { name: 'Escribir' }).click();
  await expect(page.locator('#sheet-camera')).toBeHidden();
  await expect(page.locator('#sheet-item')).toBeVisible();
  await expect(page.locator('#f-price')).toHaveValue('2890');
  await expect(page.locator('#cands .chip.suggested b')).toHaveText('$ 2.890,00');
  await page.fill('#f-name', 'Aceite');
  await page.click('#btn-item-save');
  await expect(page.locator('#total-amount')).toHaveText('$ 2.890,00');
});

test('desde la hoja: «Leer precio con foto» con la cámara no pierde lo cargado', async ({ page, context }) => {
  await fakeCamera(page);
  await openOffline(page, context);
  const p = await painter(context);
  const b64 = await renderLabel(p, { items: [{ text: '$ 2.890', x: 60, y: 420, size: 230 }] });
  await p.close();
  await page.evaluate((b) => window.__setFakeCam(b), b64);
  await page.click('#btn-manual');
  await page.fill('#f-name', 'Aceite');
  await page.click('#f-plus');
  await page.click('#btn-item-photo');
  await expect(page.locator('#cam-shutter')).toBeEnabled();
  await page.click('#cam-shutter');
  await expect(page.locator('#item-busy')).toBeHidden({ timeout: 120_000 });
  await expect(page.locator('#f-name')).toHaveValue('Aceite');
  await expect(page.locator('#f-qty')).toHaveText('2');
  await page.locator('#cands .chip.suggested').click();
  await page.click('#btn-item-save');
  await expect(page.locator('#total-amount')).toHaveText('$ 5.780,00');
});

test('desde la hoja: «Escanear código» lee solo y vuelve a la hoja', async ({ page, context }) => {
  await fakeCamera(page);
  await openOffline(page, context);
  await page.evaluate((b) => window.__setFakeCam(b), await barcodeOnly(context));
  await page.click('#btn-manual');
  await page.click('#btn-item-code');
  await expect(page.locator('#sheet-camera')).toBeHidden({ timeout: 15_000 });
  await expect(page.locator('#f-code')).toHaveText(EAN13);
});

test('sin permiso de cámara: lo explica y ofrece la cámara del sistema', async ({ page, context }) => {
  await fakeCamera(page);
  await page.addInitScript(() => (window.__camDeny = true));
  await openOffline(page, context);
  await page.click('#btn-scan');
  await expect(page.locator('#cam-error')).toBeVisible();
  await expect(page.locator('#cam-error')).toContainText('permiso');
  const chooser = page.waitForEvent('filechooser');
  await page.click('#cam-fallback');
  const fc = await chooser;
  expect(await fc.element().getAttribute('capture')).toBe('environment');
  await expect(page.locator('#sheet-camera')).toBeHidden();
});

test('botón Galería abre el selector sin forzar la cámara', async ({ page, context }) => {
  await fakeCamera(page);
  await openOffline(page, context);
  await page.click('#btn-scan');
  const chooser = page.waitForEvent('filechooser');
  await page.click('#cam-gallery');
  const fc = await chooser;
  expect(await fc.element().getAttribute('capture')).toBe(null);
});
