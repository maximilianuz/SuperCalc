import { test, expect } from '@playwright/test';
import { openOffline, reloadSettled } from './helpers.js';

const at = (s) => new Date(`${s}-03:00`).getTime();

async function addManual(page, { name, price }) {
  await page.click('#btn-manual');
  await page.fill('#f-name', name);
  await page.fill('#f-price', price);
  await page.click('#btn-item-save');
  await expect(page.locator('#sheet-item')).toBeHidden();
}

test('terminar compra: guarda con lugar y fecha, vacía la lista, Deshacer', async ({ page, context }) => {
  await page.clock.setFixedTime(at('2026-10-03T10:05:00'));
  await openOffline(page, context);
  await addManual(page, { name: 'Yerba', price: '4250' });
  await addManual(page, { name: 'Leche', price: '1100' });
  await page.click('#btn-finish');
  await expect(page.locator('#finish-total')).toHaveText('$ 5.350,00');
  await page.locator('#finish-places').getByRole('radio', { name: 'Supermercado' }).click();
  await expect(page.locator('#finish-places').getByRole('radio', { name: 'Supermercado' })).toHaveAttribute('aria-checked', 'true');
  await page.click('#btn-finish-save');
  await expect(page.locator('.item')).toHaveCount(0);
  await expect(page.locator('#total-amount')).toHaveText('$ 0,00');
  const l = await page.evaluate(() => window.__compras.ledger.purchases);
  expect(l).toHaveLength(1);
  expect(l[0]).toMatchObject({ day: '2026-10-03', place: 'super', total: 535000 });

  await page.locator('#toast-host').getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.locator('.item')).toHaveCount(2);
  expect(await page.evaluate(() => window.__compras.ledger.purchases.length)).toBe(0);
});

test('detecta compras distintas el mismo día (súper a la mañana, kiosco a la tarde)', async ({ page, context }) => {
  await page.clock.setFixedTime(at('2026-10-03T10:00:00'));
  await openOffline(page, context);
  await addManual(page, { name: 'Yerba', price: '4250' });
  await page.clock.setFixedTime(at('2026-10-03T18:30:00'));
  await addManual(page, { name: 'Alfajor', price: '900' });
  await page.click('#btn-finish');
  await expect(page.locator('#finish-trips li')).toHaveCount(2);
  await expect(page.locator('#finish-trips li').first()).toContainText('Hoy · 10:00');
  await page.click('#btn-finish-save');
  const l = await page.evaluate(() => window.__compras.ledger.purchases.map((p) => [p.day, p.total]));
  expect(l).toEqual([
    ['2026-10-03', 90000],
    ['2026-10-03', 425000],
  ]);
});

test('cambio de día: la compra de ayer se guarda sola; cambio de mes: cierre con resumen', async ({ page, context }) => {
  await page.clock.setFixedTime(at('2026-08-20T11:00:00'));
  await openOffline(page, context);
  await addManual(page, { name: 'Arroz', price: '10000' });
  await page.click('#btn-finish');
  await page.click('#btn-finish-save');

  await page.clock.setFixedTime(at('2026-09-29T19:00:00'));
  await reloadSettled(page);
  await addManual(page, { name: 'Fideos', price: '5000' });
  await addManual(page, { name: 'Queso', price: '6000' });

  // Al otro día (y otro mes): se guarda sola y se cierra septiembre
  await page.clock.setFixedTime(at('2026-10-01T09:00:00'));
  await reloadSettled(page);
  await expect(page.locator('.item')).toHaveCount(0);
  await expect(page.locator('#toast-host .toast')).toContainText('Guardamos en Gastos la compra del mar 29 sept ($ 11.000,00)');
  const card = page.locator('#close-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Cierre de septiembre 2026');
  await expect(card.locator('.close-total')).toHaveText('$ 11.000,00');
  await expect(card).toContainText('1 compra');
  await expect(card).toContainText('▲ 10,0 % vs agosto');

  // Resumen del mes y, desde ahí, las compras
  await card.getByRole('button', { name: 'Ver resumen' }).click();
  const r = page.locator('#sheet-recap');
  await expect(r).toBeVisible();
  await expect(page.locator('#recap-title')).toHaveText('Septiembre 2026');
  await expect(r.locator('.recap-total')).toHaveText('$ 11.000,00');
  await expect(r).toContainText('▲ 10,0 % vs agosto');
  await expect(r.locator('.recap-places li')).toHaveCount(1);
  await expect(r.locator('.recap-places li')).toContainText('Sin especificar');
  await r.getByRole('button', { name: 'Ver las compras del mes' }).click();
  await expect(r).toBeHidden();
  const g = page.locator('#sheet-gastos');
  await expect(g).toBeVisible();
  await expect(page.locator('#gastos-title')).toHaveText('Septiembre 2026');
  await expect(g).toContainText('Cerrado el 1 oct 2026');
  await expect(g.locator('.purchase-row')).toHaveCount(1);
  await expect(g.locator('.purchase-row')).toContainText('guardada sola');
  await g.locator('.purchase-row').click();
  await expect(page.locator('#gastos-title')).toHaveText('Compra del mar 29 sept');
  await g.getByRole('radio', { name: 'Kiosco' }).click();
  await expect(g.getByRole('radio', { name: 'Kiosco' })).toHaveAttribute('aria-checked', 'true');
  await page.click('#gastos-back');
  await expect(g.locator('.place-bars')).toContainText('Kiosco');
  await page.locator('#sheet-gastos [data-close]').click();
  await expect(card).toBeHidden(); // ya se vio

  // Sigue cerrado una sola vez aunque se recargue
  await reloadSettled(page);
  await expect(card).toBeHidden();
  expect(await page.evaluate(() => window.__compras.ledger.closes.map((c) => c.month))).toEqual(['2026-08', '2026-09']);
});

test('deshacer el guardado automático devuelve la lista y no insiste', async ({ page, context }) => {
  await page.clock.setFixedTime(at('2026-10-02T20:00:00'));
  await openOffline(page, context);
  await addManual(page, { name: 'Pan', price: '1500' });
  await page.clock.setFixedTime(at('2026-10-03T08:00:00'));
  await reloadSettled(page);
  await expect(page.locator('.item')).toHaveCount(0);
  await page.locator('#toast-host').getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.locator('.item')).toHaveCount(1);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(200);
  await expect(page.locator('.item')).toHaveCount(1);
});

test('historial anual: barras por mes, total, promedio, años y borrar compra', async ({ page, context }) => {
  const seed = {
    v: 1,
    purchases: [
      { id: 'a', day: '2025-12-20', start: 0, end: 0, place: 'super', items: [{ name: 'X', code: '', cents: 800000, qty: 1 }] },
      { id: 'b', day: '2026-01-10', start: 0, end: 0, place: 'super', items: [{ name: 'Yerba', code: '', cents: 1000000, qty: 1 }] },
      { id: 'c', day: '2026-03-05', start: 0, end: 0, place: 'kiosco', items: [{ name: 'Alfajor', code: '', cents: 100000, qty: 2 }] },
      { id: 'd', day: '2026-03-20', start: 0, end: 0, place: 'super', items: [{ name: 'Carne', code: '', cents: 2800000, qty: 1 }] },
    ],
    closes: [
      { month: '2025-12', closedAt: 1, seen: true },
      { month: '2026-01', closedAt: 1, seen: true },
      { month: '2026-03', closedAt: 1, seen: true },
    ],
  };
  await page.clock.setFixedTime(at('2026-04-10T12:00:00'));
  await page.addInitScript((seed) => {
    if (!sessionStorage.getItem('s')) {
      localStorage.setItem('compras.gastos.v1', JSON.stringify(seed));
      sessionStorage.setItem('s', '1');
    }
  }, seed);
  await openOffline(page, context);
  await addManual(page, { name: 'Pan', price: '2000' });
  await page.click('#btn-gastos');
  const g = page.locator('#sheet-gastos');
  await expect(page.locator('#g-year')).toHaveText('2026');
  await expect(page.locator('#g-total')).toHaveText('$ 40.000,00');
  await expect(g).toContainText('3 compras guardadas · promedio $ 20.000,00 por mes (2 meses con compras)');
  await expect(g.locator('.bars rect.bar:not(.empty)')).toHaveCount(3); // ene, mar y lo en curso de abril
  await expect(g.locator('.month-row')).toHaveCount(3);
  await expect(g.locator('.month-row').first()).toContainText('abril');
  await expect(g.locator('.month-row').first()).toContainText('$ 2.000,00 sin guardar');
  await expect(g.locator('.month-row').nth(1)).toContainText('marzo');
  await expect(g.locator('.month-row').nth(1)).toContainText('$ 30.000,00');
  await expect(page.locator('#g-next')).toBeDisabled();
  await page.click('#g-prev');
  await expect(page.locator('#g-year')).toHaveText('2025');
  await expect(page.locator('#g-total')).toHaveText('$ 8.000,00');
  await expect(page.locator('#g-prev')).toBeDisabled();
  await page.click('#g-next');

  await g.locator('.month-row', { hasText: 'marzo' }).click();
  await expect(g.locator('.place-bars li')).toHaveCount(2);
  await g.locator('.purchase-row', { hasText: 'Kiosco' }).click();
  await expect(g.locator('.p-items li')).toContainText('2 × $ 1.000,00');
  await g.getByRole('button', { name: 'Borrar compra' }).click();
  await expect(g.locator('.purchase-row')).toHaveCount(1);
  await g.locator('.toast-host').getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.locator('#gastos-title')).toHaveText('Compra del jue 5 mar');
});

test('lugar escrito a mano, editable, con tipo recordado y exportación CSV del mes', async ({ page, context }) => {
  await page.clock.setFixedTime(at('2026-09-06T10:05:00'));
  await openOffline(page, context);
  await addManual(page, { name: 'Yerba', price: '4250' });
  await addManual(page, { name: 'Leche', price: '1100' });
  await page.click('#btn-finish');
  await page.fill('#finish-place-name', 'Coto Palermo');
  await page.locator('#finish-places').getByRole('radio', { name: 'Supermercado' }).click();
  await page.click('#btn-finish-save');

  // Otra compra en el mismo lugar: al escribirlo se elige solo el tipo
  await page.clock.setFixedTime(at('2026-09-13T11:00:00'));
  await reloadSettled(page);
  await addManual(page, { name: 'Arroz', price: '1599,50' });
  await page.click('#btn-finish');
  await page.locator('#finish-known').getByRole('radio', { name: 'Otro lugar' }).click();
  await page.fill('#finish-place-name', 'coto palermo');
  await expect(page.locator('#finish-places').getByRole('radio', { name: 'Supermercado' })).toHaveAttribute('aria-checked', 'true');
  await page.click('#btn-finish-save');

  // Editar el lugar de una compra desde Gastos
  await page.click('#btn-gastos');
  const g = page.locator('#sheet-gastos');
  await g.locator('.month-row', { hasText: 'septiembre' }).click();
  await expect(g.locator('.purchase-row').first()).toContainText('dom 13 sept · coto palermo');
  await g.locator('.purchase-row').first().click();
  await page.fill('#g-place-name', 'Día Belgrano');
  await page.press('#g-place-name', 'Enter');
  await g.getByRole('radio', { name: 'Almacén / minimercado' }).click();
  await page.click('#gastos-back');
  await expect(g.locator('.purchase-row').first()).toContainText('Día Belgrano');
  await expect(g.locator('.purchase-row').first()).toContainText('Almacén / minimercado');

  // Exportar
  const dl = page.waitForEvent('download');
  await page.click('#g-export');
  const d = await dl;
  expect(d.suggestedFilename()).toBe('compras-2026-09.csv');
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(await d.path(), 'utf8');
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text.slice(1).trimEnd().split('\r\n')).toEqual([
    'Fecha,Hora,Lugar,Tipo de gasto,Monto,Moneda,Artículos,Detalle',
    '2026-09-06,10:05,Coto Palermo,Supermercado,5350.00,ARS,2,Leche x1; Yerba x1',
    '2026-09-13,11:00,Día Belgrano,Almacén / minimercado,1599.50,ARS,1,Arroz x1',
  ]);
});

test('el resumen de cierre de mes también exporta', async ({ page, context }) => {
  await page.clock.setFixedTime(at('2026-09-20T10:00:00'));
  await openOffline(page, context);
  await addManual(page, { name: 'Pan', price: '1500' });
  await page.click('#btn-finish');
  await page.fill('#finish-place-name', 'Panadería');
  await page.click('#btn-finish-save');
  await page.clock.setFixedTime(at('2026-10-01T09:00:00'));
  await reloadSettled(page);
  const dl = page.waitForEvent('download');
  await page.locator('#close-card').getByRole('button', { name: 'Exportar CSV' }).click();
  expect((await dl).suggestedFilename()).toBe('compras-2026-09.csv');
});

test('terminar compra: los lugares donde ya compraste se eligen con un toque', async ({ page, context }) => {
  await page.clock.setFixedTime(at('2026-09-06T10:05:00'));
  await openOffline(page, context);
  await addManual(page, { name: 'Yerba', price: '4250' });
  await page.click('#btn-finish');
  await expect(page.locator('#finish-known')).toBeHidden();
  await page.fill('#finish-place-name', 'Coto Palermo');
  await page.locator('#finish-places').getByRole('radio', { name: 'Supermercado' }).click();
  await expect(page.locator('#btn-finish-save')).toHaveText('Guardar en Coto Palermo');
  await page.click('#btn-finish-save');

  await addManual(page, { name: 'Leche', price: '1100' });
  await page.click('#btn-finish');
  await expect(page.locator('#finish-sub')).toHaveText('1 artículo · hoy a las 10:05');
  await expect(page.locator('#finish-other')).toBeHidden();
  const row = page.locator('#finish-known').getByRole('radio', { name: /Coto Palermo/ });
  await expect(row).toContainText('Supermercado');
  await expect(row).toContainText('1 compra');
  await expect(page.locator('#btn-finish-save')).toHaveText('Guardar en Gastos');
  await row.click();
  await expect(row).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#btn-finish-save')).toHaveText('Guardar en Coto Palermo');
  await page.click('#btn-finish-save');
  const l = await page.evaluate(() => window.__compras.ledger.purchases.map((p) => [p.placeName, p.place, p.total]));
  expect(l).toContainEqual(['Coto Palermo', 'super', 110000]);
});

test('resumen del mes: gasto por lugar y el producto que más subió', async ({ page, context }) => {
  await page.clock.setFixedTime(at('2026-08-10T10:00:00'));
  await openOffline(page, context);
  await addManual(page, { name: 'Yerba', price: '3928' });
  await page.click('#btn-finish');
  await page.click('#btn-finish-save');
  await page.clock.setFixedTime(at('2026-09-06T10:00:00'));
  await reloadSettled(page);
  await addManual(page, { name: 'Yerba', price: '4250' });
  await page.click('#btn-finish');
  await page.fill('#finish-place-name', 'Coto Palermo');
  await page.click('#btn-finish-save');
  await addManual(page, { name: 'Alfajor', price: '900' });
  await page.click('#btn-finish');
  await page.locator('#finish-known').getByRole('radio', { name: 'Otro lugar' }).click();
  await page.fill('#finish-place-name', 'Kiosco Juan');
  await page.click('#btn-finish-save');
  await page.clock.setFixedTime(at('2026-10-01T09:00:00'));
  await reloadSettled(page);
  await page.locator('#close-card').getByRole('button', { name: 'Ver resumen' }).click();
  const r = page.locator('#sheet-recap');
  await expect(r.locator('.recap-places li')).toHaveCount(2);
  await expect(r.locator('.recap-places li').first()).toContainText('Coto Palermo');
  await expect(r.locator('.recap-places li').first()).toContainText('$ 4.250,00');
  await expect(r).toContainText('2 compras · promedio $ 2.575,00');
  await expect(r.locator('.recap-riser')).toContainText('Yerba');
  await expect(r.locator('.recap-riser')).toContainText('▲ 8,2 %');
  const dl = page.waitForEvent('download');
  await r.getByRole('button', { name: 'Exportar CSV' }).click();
  expect((await dl).suggestedFilename()).toBe('compras-2026-09.csv');
});
