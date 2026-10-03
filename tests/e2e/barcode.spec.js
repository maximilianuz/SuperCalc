import { test, expect } from '@playwright/test';
import { openOffline, renderLabel, renderBarcodePhoto, barcodePNG, eanWithCheck, filePayload, painter } from './helpers.js';

const EAN13 = eanWithCheck('779038700016');
const EAN8 = eanWithCheck('9638507');
const UPCA = eanWithCheck('03600029145');

async function scanCode(page, b64) {
  await page.setInputFiles('#file-code', filePayload('code.png', b64));
  await expect(page.locator('#sheet-item')).toBeVisible();
  await expect(page.locator('#item-busy')).toBeHidden({ timeout: 60_000 });
  await expect(page.locator('#scan-msg')).toBeVisible();
}

test('EAN-13 normal, grande y rotado 90°; EAN-8; UPC-A; imagen sin código', async ({ page, context }) => {
  await openOffline(page, context);
  const p = await painter(context);
  const code13 = await barcodePNG('ean13', EAN13, 3);
  const cases = [
    ['normal', await renderBarcodePhoto(p, code13), EAN13],
    ['grande', await renderBarcodePhoto(p, await barcodePNG('ean13', EAN13, 12), { photoW: 2000, photoH: 1500, w: 1900 }), EAN13],
    ['rotado', await renderBarcodePhoto(p, code13, { rotate: 90, photoW: 900, photoH: 1200 }), EAN13],
    ['ean8', await renderBarcodePhoto(p, await barcodePNG('ean8', EAN8, 3)), EAN8],
    ['upca', await renderBarcodePhoto(p, await barcodePNG('upca', UPCA, 3)), `0${UPCA}`],
  ];
  const noCode = await renderLabel(p, { items: [{ text: 'Sin código acá', x: 60, y: 300, size: 90 }] });
  await p.close();

  for (const [name, b64, expected] of cases) {
    await scanCode(page, b64);
    await expect(page.locator('#f-code'), name).toHaveText(expected);
    await expect(page.locator('#scan-msg'), name).toContainText(`Código ${expected}`);
    await page.locator('#sheet-item [data-close]').click();
    await expect(page.locator('#sheet-item')).toBeHidden();
  }

  await scanCode(page, noCode);
  await expect(page.locator('#scan-msg')).toContainText('No encontramos un código de barras');
  await expect(page.locator('#f-code-line')).toBeHidden();
});

test('etiqueta con precio y código: lee los dos de la MISMA foto', async ({ page, context }) => {
  await openOffline(page, context);
  const p = await painter(context);
  const b64 = await renderLabel(p, {
    w: 1200,
    h: 900,
    photoW: 1700,
    photoH: 1300,
    items: [
      { text: 'Yerba Playadito 1 kg', x: 60, y: 110, size: 56, weight: 600 },
      { text: '$ 4.250', x: 60, y: 400, size: 220 },
    ],
    barcode: { b64: await barcodePNG('ean13', EAN13, 3), x: 60, y: 520, w: 460 },
  });
  await p.close();
  await page.setInputFiles('#file-photo', filePayload('label.png', b64));
  await expect(page.locator('#item-busy')).toBeHidden({ timeout: 120_000 });
  await expect(page.locator('#f-code')).toHaveText(EAN13);
  await expect(page.locator('#scan-msg')).toContainText('También leímos el código de barras');
  await expect(page.locator('#cands .chip.suggested b')).toHaveText('$ 4.250,00');
  await page.locator('#cands .chip.suggested').click();
  await page.fill('#f-name', 'Yerba Playadito 1 kg');
  await page.click('#btn-item-save');
  await expect(page.locator('.item')).toHaveCount(1);
  expect(await page.evaluate(() => Object.keys(window.__compras.hist.products))).toEqual([`c:${EAN13}`]);

  // El mismo código otra vez desde «Código»: reconoce el producto y suma al guardar con el mismo precio
  const p2 = await painter(context);
  const code = await renderBarcodePhoto(p2, await barcodePNG('ean13', EAN13, 3));
  await p2.close();
  await scanCode(page, code);
  await expect(page.locator('#f-name')).toHaveValue('Yerba Playadito 1 kg');
  await expect(page.locator('#scan-msg')).toContainText('Yerba Playadito 1 kg');
  await expect(page.locator('#f-trend')).toContainText('Último precio: $ 4.250,00');
  await page.fill('#f-price', '4250');
  await expect(page.locator('#f-trend')).toContainText('Igual que la última vez');
  await page.click('#btn-item-save');
  await expect(page.locator('.item')).toHaveCount(1);
  await expect(page.locator('.item output')).toHaveText('2');
});

test('«Escanear código» desde la hoja no pierde lo cargado', async ({ page, context }) => {
  await openOffline(page, context);
  await page.click('#btn-manual');
  await page.fill('#f-name', 'Galletitas');
  await page.fill('#f-price', '1234,56');
  await page.click('#f-plus');
  const p = await painter(context);
  const b64 = await renderBarcodePhoto(p, await barcodePNG('ean13', EAN13, 3));
  await p.close();
  const chooser = page.waitForEvent('filechooser');
  await page.click('#btn-item-code');
  await (await chooser).setFiles(filePayload('c.png', b64));
  await expect(page.locator('#item-busy')).toBeHidden({ timeout: 60_000 });
  await expect(page.locator('#f-code')).toHaveText(EAN13);
  await expect(page.locator('#f-name')).toHaveValue('Galletitas');
  await expect(page.locator('#f-price')).toHaveValue('1234,56');
  await expect(page.locator('#f-qty')).toHaveText('2');
});
