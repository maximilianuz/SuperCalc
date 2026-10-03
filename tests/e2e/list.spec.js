import { test, expect } from '@playwright/test';
import { openOffline, reloadSettled } from './helpers.js';

async function addManual(page, { name, price, qty = 1 }) {
  await page.click('#btn-manual');
  await expect(page.locator('#sheet-item')).toBeVisible();
  if (name) await page.fill('#f-name', name);
  await page.fill('#f-price', price);
  for (let i = 1; i < qty; i++) await page.click('#f-plus');
  await page.click('#btn-item-save');
  await expect(page.locator('#sheet-item')).toBeHidden();
}

test('alta manual, merge de iguales, quitar con Deshacer, persistencia sin red', async ({ page, context }) => {
  await openOffline(page, context);
  await expect(page.locator('#total-amount')).toHaveText('$ 0,00');
  await expect(page.locator('#empty')).toBeVisible();

  await addManual(page, { name: 'Yerba Playadito 1 kg', price: '1299,50', qty: 2 });
  await expect(page.locator('#total-amount')).toHaveText('$ 2.599,00');
  await expect(page.locator('#total-meta')).toHaveText('1 artículo · 2 unidades');

  // Mismo nombre (distinta mayúscula/tilde) y mismo precio → suma cantidad
  await addManual(page, { name: 'yerba playadito 1 KG', price: '1.299,50' });
  await expect(page.locator('.item')).toHaveCount(1);
  await expect(page.locator('.item output')).toHaveText('3');
  await expect(page.locator('#total-amount')).toHaveText('$ 3.898,50');

  // Mismo nombre, otro precio → otro artículo
  await addManual(page, { name: 'Yerba Playadito 1 kg', price: '1400' });
  await expect(page.locator('.item')).toHaveCount(2);

  // Sin nombre
  await addManual(page, { price: '850' });
  await expect(page.locator('.item')).toHaveCount(3);
  await expect(page.locator('.item-name.unnamed')).toHaveText('Artículo sin nombre');
  await expect(page.locator('#total-meta')).toHaveText('3 artículos · 5 unidades');

  // − y + en la fila
  const first = page.locator('.item').first();
  await first.locator('[data-act=plus]').click();
  await expect(first.locator('output')).toHaveText('2');
  await first.locator('[data-act=minus]').click();
  await first.locator('[data-act=minus]').click();
  await expect(page.locator('.item')).toHaveCount(2);
  const toast = page.locator('#toast-host .toast').last();
  await expect(toast).toContainText('Quitaste');
  await toast.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.locator('.item')).toHaveCount(3);

  // Editar: tocar la fila abre la hoja con los datos
  await page.locator('.item').nth(1).locator('.item-main').click();
  await expect(page.locator('#item-title')).toHaveText('Editar artículo');
  await expect(page.locator('#f-price')).toHaveValue('1400');
  await page.fill('#f-price', '1450');
  await page.click('#btn-item-save');
  await expect(page.locator('.item').nth(1)).toContainText('$ 1.450,00');

  // Persistencia: recargar sin red
  const before = await page.locator('#total-amount').textContent();
  await reloadSettled(page);
  await expect(page.locator('#total-amount')).toHaveText(before);
  await expect(page.locator('.item')).toHaveCount(3);
});

test('Vaciar con confirmación propia (sin confirm()) y Deshacer', async ({ page, context }) => {
  await openOffline(page, context);
  await addManual(page, { name: 'Arroz', price: '1000' });
  await addManual(page, { name: 'Fideos', price: '900' });
  await page.click('#btn-clear');
  const dlg = page.locator('#dlg-confirm');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('¿Vaciar la lista?');
  await page.click('#confirm-cancel');
  await expect(page.locator('.item')).toHaveCount(2);
  await page.click('#btn-clear');
  await page.click('#confirm-ok');
  await expect(page.locator('.item')).toHaveCount(0);
  await expect(page.locator('#total-amount')).toHaveText('$ 0,00');
  await page.locator('#toast-host').getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.locator('.item')).toHaveCount(2);
});

test('límite diario: barra, «Te quedan hoy», aviso al superarlo y sigue sumando', async ({ page, context }) => {
  await openOffline(page, context);
  await page.click('#btn-limit');
  await expect(page.locator('#limit-periods').getByRole('radio', { name: 'Día' })).toHaveAttribute('aria-checked', 'true');
  await page.fill('#f-limit', '5000');
  await page.click('#btn-limit-save');
  await expect(page.locator('#limit-box')).toBeVisible();
  await expect(page.locator('#limit-text')).toHaveText('Te quedan hoy $ 5.000,00');
  await expect(page.locator('#btn-limit')).toHaveText('Por día $ 5.000');
  await expect(page.locator('#limit-period')).toBeHidden();

  await addManual(page, { name: 'Aceite', price: '3000' });
  await expect(page.locator('#limit-text')).toHaveText('Te quedan hoy $ 2.000,00');
  expect(await page.evaluate(() => window.__vibrations.length)).toBe(0);
  await expect(page.locator('#total-card')).not.toHaveClass(/over/);

  await addManual(page, { name: 'Queso', price: '2500,50' });
  await expect(page.locator('#limit-text')).toHaveText('Hoy te pasaste por $ 500,50');
  await expect(page.locator('#total-card')).toHaveClass(/over/);
  await expect(page.locator('#toast-host .toast.bad')).toContainText('Superaste el límite de hoy: te pasaste por $ 500,50');
  expect(await page.evaluate(() => window.__vibrations.length)).toBe(1);
  const markLeft = await page.locator('#limit-mark').evaluate((e) => parseFloat(e.style.left));
  expect(markLeft).toBeGreaterThan(80);
  expect(markLeft).toBeLessThan(100);

  // Sigue sumando y no vuelve a vibrar mientras siga pasado
  await addManual(page, { name: 'Pan', price: '1000' });
  await expect(page.locator('#total-amount')).toHaveText('$ 6.500,50');
  await expect(page.locator('#limit-text')).toHaveText('Hoy te pasaste por $ 1.500,50');
  expect(await page.evaluate(() => window.__vibrations.length)).toBe(1);

  await reloadSettled(page);
  await expect(page.locator('#limit-text')).toHaveText('Hoy te pasaste por $ 1.500,50');

  // Terminar la compra no reinicia el día: lo guardado hoy sigue contando
  await page.click('#btn-finish');
  await page.click('#btn-finish-save');
  await expect(page.locator('#total-amount')).toHaveText('$ 0,00');
  await expect(page.locator('#limit-text')).toHaveText('Hoy te pasaste por $ 1.500,50');
  await expect(page.locator('#limit-period')).toHaveText('Incluye $ 6.500,50 ya guardados hoy');

  await page.click('#btn-limit');
  await page.click('#btn-limit-remove');
  await expect(page.locator('#limit-box')).toBeHidden();
});

const at = (s) => new Date(`${s}-03:00`).getTime();
const seedLedger = (purchases) =>
  ({ v: 1, closes: [], purchases: purchases.map(([day, cents], i) => ({ id: `p${i}`, day, start: 0, end: 0, place: '', items: [{ name: 'x', code: '', cents, qty: 1 }] })) });

test('límite mensual: sugiere cuánto gastar hoy según lo que ya se gastó en el mes', async ({ page, context }) => {
  await page.clock.setFixedTime(at('2026-10-03T10:00:00'));
  await page.addInitScript((l) => {
    if (sessionStorage.getItem('s')) return;
    localStorage.setItem('compras.gastos.v1', JSON.stringify(l));
    sessionStorage.setItem('s', '1');
  }, seedLedger([['2026-10-01', 6000000], ['2026-10-02', 4000000], ['2026-09-30', 9999900]]));
  await openOffline(page, context);

  await page.click('#btn-limit');
  await page.locator('#limit-periods').getByRole('radio', { name: 'Mes' }).click();
  await expect(page.locator('#limit-question')).toHaveText('¿Cuánto querés gastar como máximo por mes?');
  await page.fill('#f-limit', '400000');
  // Quedan 300.000 para 29 días (3 al 31)
  await expect(page.locator('#limit-preview')).toHaveText('Hoy podés gastar hasta $ 10.344 (quedan 29 días)');
  await page.click('#btn-limit-save');

  await expect(page.locator('#btn-limit')).toHaveText('Por mes $ 400.000');
  await expect(page.locator('#limit-text')).toHaveText('Te quedan hoy $ 10.344,00');
  await expect(page.locator('#limit-period span')).toHaveText(['Sugerido para hoy $ 10.344 · quedan 29 días', 'Mes: $ 100.000 de $ 400.000']);

  // Pasarse de lo sugerido avisa, pero el mes sigue en regla
  await addManual(page, { name: 'Asado', price: '12000' });
  await expect(page.locator('#limit-text')).toHaveText('Hoy te pasaste por $ 1.656,00');
  await expect(page.locator('#toast-host .toast.bad')).toContainText('Pasaste lo sugerido para hoy por $ 1.656,00');
  await expect(page.locator('#limit-period span').nth(1)).toHaveText('Mes: $ 112.000 de $ 400.000');

  // Pasarse del mes
  await addManual(page, { name: 'Tele', price: '300000' });
  await expect(page.locator('#limit-period .bad')).toHaveText('Te pasaste del límite del mes por $ 12.000,00');
  await expect(page.locator('#toast-host .toast.bad').last()).toContainText('Superaste el límite del mes: te pasaste por $ 12.000,00');
});

test('datos corruptos en localStorage no rompen la app', async ({ page, context }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('sembrado')) {
      localStorage.setItem('compras.lista.v1', '{"items": [{"id": 1, "cents": "x"}, ');
      localStorage.setItem('compras.historial.v1', '[1,2,3]');
      sessionStorage.setItem('sembrado', '1');
    }
  });
  await openOffline(page, context);
  await expect(page.locator('#total-amount')).toHaveText('$ 0,00');
  await addManual(page, { name: 'Sal', price: '700' });
  await expect(page.locator('.item')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('botón «Atrás» cierra la hoja abierta sin recargar ni salir', async ({ page, context }) => {
  await openOffline(page, context);
  await page.evaluate(() => (window.__marca = 'viva'));
  await page.click('#btn-manual');
  await expect(page.locator('#sheet-item')).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.locator('#sheet-item')).toBeHidden();
  // Cerrar y abrir otra enseguida (carrera con el history.back pendiente)
  await page.click('#btn-manual');
  await page.evaluate(() => {
    document.querySelector('#sheet-item [data-close]').click();
    document.querySelector('#btn-history').click();
  });
  await expect(page.locator('#sheet-history')).toBeVisible();
  await page.waitForTimeout(200);
  await page.evaluate(() => history.back());
  await expect(page.locator('#sheet-history')).toBeHidden();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__marca)).toBe('viva');
});

test('recargar con una hoja abierta no provoca recargas fantasma después', async ({ page, context }) => {
  await openOffline(page, context);
  await page.click('#btn-manual');
  expect(await page.evaluate(() => history.state)).toEqual({ comprasModal: true });
  await page.reload();
  await expect(page.locator('#sheet-item')).toBeHidden();
  await page.evaluate(() => (window.__marca = 'viva'));
  // Una recarga real borraría esta marca (las navegaciones del mismo documento, no)
  for (let i = 0; i < 3; i++) {
    await page.click('#btn-manual');
    await page.locator('#sheet-item [data-close]').click();
  }
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__marca)).toBe('viva');
  expect(await page.evaluate(() => history.state)).toBe(null);
});
