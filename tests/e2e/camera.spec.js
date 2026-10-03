import { test, expect } from '@playwright/test';
import { openOffline, fakeCamera, renderLabel, renderBarcodePhoto, barcodePNG, eanWithCheck, painter } from './helpers.js';

const EAN13 = eanWithCheck('779038700016');

test('cámara en vivo: el código se lee solo, sin sacar foto', async ({ page, context }) => {
  await fakeCamera(page);
  await openOffline(page, context);
  const p = await painter(context);
  const b64 = await renderBarcodePhoto(p, await barcodePNG('ean13', EAN13, 3));
  await p.close();
  await page.evaluate((b) => window.__setFakeCam(b), b64);
  await page.click('#btn-code');
  await expect(page.locator('#sheet-camera')).toBeVisible();
  expect(await page.evaluate(() => window.__camConstraints.video.facingMode)).toEqual({ ideal: 'environment' });
  await expect(page.locator('#sheet-item')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#sheet-camera')).toBeHidden();
  await expect(page.locator('#f-code')).toHaveText(EAN13);
  // La cámara quedó apagada
  expect(await page.evaluate(() => document.querySelector('#cam-video').srcObject)).toBe(null);
});

test('cámara en vivo: foto del precio con el disparador (y el código detectado en vivo)', async ({ page, context }) => {
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
  await page.click('#btn-photo');
  await expect(page.locator('#cam-status')).toContainText(`Código ${EAN13}`, { timeout: 15_000 });
  await page.click('#cam-shutter');
  await expect(page.locator('#sheet-camera')).toBeHidden();
  await expect(page.locator('#item-busy')).toBeHidden({ timeout: 120_000 });
  await expect(page.locator('#f-code')).toHaveText(EAN13);
  await expect(page.locator('#cands .chip.suggested b')).toHaveText('$ 4.250,00');
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

test('sin permiso de cámara: lo explica y ofrece la cámara del sistema', async ({ page, context }) => {
  await fakeCamera(page);
  await page.addInitScript(() => (window.__camDeny = true));
  await openOffline(page, context);
  await page.click('#btn-photo');
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
  await page.click('#btn-code');
  const chooser = page.waitForEvent('filechooser');
  await page.click('#cam-gallery');
  const fc = await chooser;
  expect(await fc.element().getAttribute('capture')).toBe(null);
});
