import { test, expect } from '@playwright/test';
import { openOffline, reloadSettled, painter, renderBarcodePhoto, barcodePNG, eanWithCheck, filePayload } from './helpers.js';

const DAY = 86_400_000;
const DAY0 = new Date('2026-09-12T13:00:00-03:00').getTime();

async function addManual(page, { name, price }) {
  await page.click('#btn-manual');
  await page.fill('#f-name', name);
  await page.fill('#f-price', price);
  await page.click('#btn-item-save');
  await expect(page.locator('#sheet-item')).toBeHidden();
}

const points = (page) => page.evaluate(() => Object.fromEntries(Object.entries(window.__compras.hist.products).map(([k, p]) => [k, p.points.map((x) => x.c)])));

test('historial: subida, bajada, corrección, actualizar, borrar y deshacer', async ({ page, context }) => {
  await page.clock.setFixedTime(DAY0);
  await openOffline(page, context);
  await addManual(page, { name: 'Leche La Serenísima 1 l', price: '1000' });
  await addManual(page, { name: 'Café La Virginia', price: '5000' });
  await page.click('#btn-clear');
  await page.click('#confirm-ok');
  await expect(page.locator('.item')).toHaveCount(0);

  // Tres semanas después
  await page.clock.setFixedTime(DAY0 + 21 * DAY);
  await reloadSettled(page);

  // Subida: mismo producto escrito distinto (minúsculas, sin tilde)
  await page.click('#btn-manual');
  await page.fill('#f-name', 'leche la serenisima 1 L');
  await expect(page.locator('#f-trend')).toContainText('Último precio: $ 1.000,00 (hace 3 semanas)');
  await page.fill('#f-price', '1082');
  await expect(page.locator('#f-trend')).toHaveText('▲ Subió 8,2 % desde $ 1.000,00 (hace 3 semanas)');
  await expect(page.locator('#f-trend')).toHaveClass(/up/);
  await page.click('#btn-item-save');
  await expect(page.locator('.item').first().locator('.tag.up')).toHaveText('▲ 8,2 %');

  // Bajada
  await page.click('#btn-manual');
  await page.fill('#f-name', 'Café La Virginia');
  await page.fill('#f-price', '4500');
  await expect(page.locator('#f-trend')).toHaveText('▼ Bajó 10,0 % desde $ 5.000,00 (hace 3 semanas)');
  await page.click('#btn-item-save');
  await expect(page.locator('.item').first().locator('.tag.down')).toHaveText('▼ 10,0 %');

  // Igual
  await page.click('#btn-manual');
  await page.fill('#f-name', 'Café La Virginia');
  await page.fill('#f-price', '4500');
  await expect(page.locator('#f-trend')).toContainText('Igual que la última vez');
  await page.locator('#sheet-item [data-close]').click();

  // Corrección de un artículo de la lista: reemplaza su registro, no agrega uno nuevo
  await page.locator('.item', { hasText: 'leche' }).locator('.item-main').click();
  await page.fill('#f-price', '1100');
  await expect(page.locator('#f-trend')).toHaveText('▲ Subió 10,0 % desde $ 1.000,00 (hace 3 semanas)');
  await page.click('#btn-item-save');
  expect(await points(page)).toEqual({ 'n:leche la serenisima 1 l': [100000, 110000], 'n:cafe la virginia': [500000, 450000] });

  // Pantalla de historial
  await page.click('#btn-history');
  const sheet = page.locator('#sheet-history');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('.stat.up b')).toHaveText('1');
  await expect(sheet.locator('.stat.down b')).toHaveText('1');
  await expect(sheet.locator('.stat').nth(2).locator('b')).toHaveText('0');
  await expect(sheet).not.toContainText('inflación');
  await expect(sheet.locator('.prod')).toHaveCount(2);

  await sheet.locator('.prod', { hasText: 'leche' }).click();
  await expect(page.locator('#history-title')).toHaveText('leche la serenisima 1 L');
  await expect(sheet.locator('.detail-price')).toHaveText('$ 1.100,00');
  await expect(sheet.locator('.detail-cum')).toContainText('▲ Subió 10,0 % acumulado desde $ 1.000,00 (12 sept 2026)');
  await expect(sheet.locator('.chart svg path.line')).toHaveCount(1);
  await expect(sheet.locator('.chart svg circle.dot')).toHaveCount(2);
  await expect(sheet.locator('.point')).toHaveCount(2);
  await expect(sheet.locator('.point').first()).toContainText('▲ 10,0 %');
  await expect(sheet.locator('.point').last()).toContainText('primer precio');

  // Actualizar precio (con aviso dentro del diálogo y Deshacer tocable)
  await page.clock.setFixedTime(DAY0 + 30 * DAY);
  await sheet.locator('#hist-price').fill('1210');
  await sheet.getByRole('button', { name: 'Guardar' }).click();
  await expect(sheet.locator('.point')).toHaveCount(3);
  await expect(sheet.locator('.detail-price')).toHaveText('$ 1.210,00');
  const toast = sheet.locator('.toast-host .toast').last();
  await expect(toast).toContainText('▲ subió 10,0 %');
  await toast.getByRole('button', { name: 'Deshacer' }).click();
  await expect(sheet.locator('.point')).toHaveCount(2);

  // Borrar un precio y deshacer
  await sheet.getByRole('button', { name: 'Borrar precio $ 1.100,00' }).click();
  await expect(sheet.locator('.point')).toHaveCount(1);
  await sheet.locator('.toast-host').getByRole('button', { name: 'Deshacer' }).click();
  await expect(sheet.locator('.point')).toHaveCount(2);

  // Borrar el producto y deshacer
  await sheet.getByRole('button', { name: 'Borrar producto' }).click();
  await expect(page.locator('#history-title')).toHaveText('Historial de precios');
  await expect(sheet.locator('.prod')).toHaveCount(1);
  await sheet.locator('.toast-host').getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.locator('#history-title')).toHaveText('leche la serenisima 1 L');
  await expect(sheet.locator('.point')).toHaveCount(2);

  // Volver, buscar y cerrar
  await page.click('#hist-back');
  await sheet.locator('#hist-q').fill('cafe');
  await expect(sheet.locator('.prod')).toHaveCount(1);
  // Botón «Atrás» (Android): cierra la hoja en vez de salir
  await page.evaluate(() => history.back());
  await expect(sheet).toBeHidden();

  // Persistencia
  await reloadSettled(page);
  expect(await points(page)).toEqual({ 'n:leche la serenisima 1 l': [100000, 110000], 'n:cafe la virginia': [500000, 450000] });
});

test('cuando aparece el código, el historial por nombre migra a la clave del código', async ({ page, context }) => {
  await page.clock.setFixedTime(DAY0);
  await openOffline(page, context);
  await addManual(page, { name: 'Mermelada Arcor', price: '2000' });
  expect(await points(page)).toEqual({ 'n:mermelada arcor': [200000] });

  await page.clock.setFixedTime(DAY0 + 7 * DAY);
  await reloadSettled(page);
  const code = eanWithCheck('779058000001');
  const p = await painter(context);
  const b64 = await renderBarcodePhoto(p, await barcodePNG('ean13', code, 3));
  await p.close();
  await page.click('#btn-manual');
  await page.fill('#f-name', 'Mermelada Arcor');
  const chooser = page.waitForEvent('filechooser');
  await page.click('#btn-item-code');
  await (await chooser).setFiles(filePayload('c.png', b64));
  await expect(page.locator('#f-code')).toHaveText(code);
  await page.fill('#f-price', '2200');
  await expect(page.locator('#f-trend')).toHaveText('▲ Subió 10,0 % desde $ 2.000,00 (hace 1 semana)');
  await page.click('#btn-item-save');
  expect(await points(page)).toEqual({ [`c:${code}`]: [200000, 220000] });
});
