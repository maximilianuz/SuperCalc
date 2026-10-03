import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyLedger,
  dayKey,
  monthKey,
  prevMonthKey,
  monthLabel,
  groupTrips,
  archiveItems,
  staleItems,
  closeMonths,
  closeSummary,
  yearSummary,
  years,
  deletePurchase,
  setPlace,
  markCloseSeen,
  sanitizeLedger,
  isClosed,
} from '../../www/js/ledger.js';

const at = (d, h = 10, m = 0) => new Date(2026, d[0] - 1, d[1], h, m).getTime();
const item = (name, cents, qty, t) => ({ id: name, name, code: '', cents, qty, addedAt: t });

test('claves de día y mes en hora local', () => {
  assert.equal(dayKey(at([9, 5], 23, 59)), '2026-09-05');
  assert.equal(monthKey(at([12, 31])), '2026-12');
  assert.equal(prevMonthKey('2026-01'), '2025-12');
  assert.equal(prevMonthKey('2026-10'), '2026-09');
  assert.equal(monthLabel('2026-09'), 'septiembre 2026');
});

test('detecta compras: por día y separando si pasan más de 2 horas', () => {
  const items = [
    item('yerba', 100, 1, at([10, 2], 10, 0)),
    item('leche', 200, 2, at([10, 2], 10, 40)),
    item('chicle', 50, 1, at([10, 2], 18, 0)), // kiosco a la tarde
    item('pan', 80, 1, at([10, 3], 9, 0)),
  ];
  const g = groupTrips(items);
  assert.equal(g.length, 3);
  assert.deepEqual(g.map((x) => x.day), ['2026-10-02', '2026-10-02', '2026-10-03']);
  assert.deepEqual(g.map((x) => x.items.map((i) => i.name)), [['yerba', 'leche'], ['chicle'], ['pan']]);
});

test('archivar crea compras con total y lugar', () => {
  const r = archiveItems(emptyLedger(), [item('yerba', 100000, 1, at([10, 2])), item('leche', 120000, 2, at([10, 2], 10, 30))], { place: 'super', now: at([10, 2], 11) });
  assert.equal(r.created.length, 1);
  const p = r.ledger.purchases[0];
  assert.equal(p.day, '2026-10-02');
  assert.equal(p.total, 340000);
  assert.equal(p.place, 'super');
  assert.equal(p.items.length, 2);
  const bad = archiveItems(emptyLedger(), [item('x', 1, 1, at([10, 2]))], { place: 'cualquiera' });
  assert.equal(bad.ledger.purchases[0].place, '');
});

test('artículos de días anteriores', () => {
  const items = [item('a', 1, 1, at([10, 2], 22)), item('b', 1, 1, at([10, 3], 8)), { id: 'c', name: 'c', cents: 1, qty: 1, addedAt: 0 }];
  assert.deepEqual(staleItems(items, at([10, 3], 12)).map((i) => i.name), ['a']);
});

test('cierre mensual: cierra meses pasados una sola vez y compara con el anterior', () => {
  let L = emptyLedger();
  L = archiveItems(L, [item('a', 100000, 1, at([8, 10]))], { now: at([8, 10]) }).ledger;
  L = archiveItems(L, [item('b', 50000, 1, at([9, 3]))], { place: 'super', now: at([9, 3]) }).ledger;
  L = archiveItems(L, [item('c', 60000, 1, at([9, 20]))], { place: 'kiosco', now: at([9, 20]) }).ledger;
  L = archiveItems(L, [item('d', 1000, 1, at([10, 1]))], { now: at([10, 1]) }).ledger;
  const r = closeMonths(L, at([10, 2]));
  assert.deepEqual(r.closed, ['2026-08', '2026-09']);
  assert.ok(isClosed(r.ledger, '2026-09'));
  assert.ok(!isClosed(r.ledger, '2026-10'));
  assert.deepEqual(closeMonths(r.ledger, at([10, 5])).closed, [], 'no vuelve a cerrar');
  const s = closeSummary(r.ledger, '2026-09');
  assert.equal(s.total, 110000);
  assert.equal(s.count, 2);
  assert.equal(s.prevTotal, 100000);
  assert.ok(Math.abs(s.pct - 10) < 1e-9);
  assert.deepEqual(s.byPlace, { super: 50000, kiosco: 60000 });
  const seen = markCloseSeen(r.ledger, '2026-09');
  assert.equal(seen.closes.find((c) => c.month === '2026-09').seen, true);
  assert.equal(seen.closes.find((c) => c.month === '2026-08').seen, true, 'los anteriores también');
});

test('historial anual con compra en curso', () => {
  let L = emptyLedger();
  L = archiveItems(L, [item('a', 100000, 1, at([1, 10]))], { now: at([1, 10]) }).ledger;
  L = archiveItems(L, [item('b', 300000, 1, at([3, 10]))], { now: at([3, 10]) }).ledger;
  L = archiveItems(L, [item('c', 5000, 1, at([3, 11]))], { now: at([3, 11]) }).ledger;
  const y = yearSummary(L, 2026, { month: '2026-03', cents: 777 });
  assert.equal(y.months.length, 12);
  assert.equal(y.total, 405000);
  assert.equal(y.count, 3);
  assert.equal(y.monthsWithData, 2);
  assert.equal(y.average, 202500);
  assert.equal(y.months[2].inProgress, 777);
  assert.equal(y.months[2].count, 2);
  assert.deepEqual(years(L, at([3, 1])), [2026]);
});

test('borrar compra y cambiar lugar no modifican el original', () => {
  const L = archiveItems(emptyLedger(), [item('a', 1, 1, at([3, 10]))], { now: at([3, 10]) }).ledger;
  const id = L.purchases[0].id;
  assert.equal(setPlace(L, id, 'mini').purchases[0].place, 'mini');
  assert.equal(L.purchases[0].place, '');
  assert.equal(deletePurchase(L, id).purchases.length, 0);
  assert.equal(L.purchases.length, 1);
});

test('lectura defensiva del registro de gastos', () => {
  assert.deepEqual(sanitizeLedger(null), emptyLedger());
  assert.deepEqual(sanitizeLedger({ purchases: 'x', closes: 3 }), emptyLedger());
  const L = sanitizeLedger({
    purchases: [
      { id: 'a', day: '2026-09-01', items: [{ cents: 100, qty: 2 }, { cents: 'x', qty: 1 }], total: 999999, place: 'super' },
      { id: 'b', day: 'ayer', items: [{ cents: 1, qty: 1 }] },
      { id: 'c', day: '2026-09-02', items: [] },
    ],
    closes: [{ month: '2026-08' }, { month: '2026-08' }, { month: 'x' }],
  });
  assert.equal(L.purchases.length, 1);
  assert.equal(L.purchases[0].total, 200, 'el total se recalcula');
  assert.equal(L.closes.length, 1);
});
