import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodRange, budgetState } from '../../www/js/budget.js';

const at = (m, d, h = 10) => new Date(2026, m - 1, d, h).getTime();
const buy = (day, total) => ({ id: day + total, day, total, items: [] });
const ledger = (...ps) => ({ purchases: ps, closes: [] });

test('períodos: semana de lunes a domingo y mes calendario, con los días que quedan', () => {
  // Sábado 3 oct 2026
  assert.deepEqual(periodRange('day', at(10, 3)), { start: '2026-10-03', end: '2026-10-03', today: '2026-10-03', daysLeft: 1 });
  assert.deepEqual(periodRange('week', at(10, 3)), { start: '2026-09-28', end: '2026-10-04', today: '2026-10-03', daysLeft: 2 });
  assert.deepEqual(periodRange('week', at(9, 28, 0)), { start: '2026-09-28', end: '2026-10-04', today: '2026-09-28', daysLeft: 7 });
  assert.deepEqual(periodRange('week', at(10, 4, 23)), { start: '2026-09-28', end: '2026-10-04', today: '2026-10-04', daysLeft: 1 });
  assert.deepEqual(periodRange('month', at(10, 3)), { start: '2026-10-01', end: '2026-10-31', today: '2026-10-03', daysLeft: 29 });
  assert.equal(periodRange('month', at(2, 10)).end, '2026-02-28');
  assert.equal(periodRange('week', at(12, 31)).end, '2027-01-03');
});

test('límite diario: cuenta lo guardado hoy más el carrito, no lo de ayer', () => {
  const l = ledger(buy('2026-10-03', 3000_00), buy('2026-10-02', 9000_00));
  const b = budgetState({ limit: 10000_00, period: 'day' }, l, 5000_00, at(10, 3));
  assert.equal(b.daily, 10000_00);
  assert.equal(b.savedToday, 3000_00);
  assert.equal(b.spentToday, 8000_00);
  assert.equal(b.remaining, 2000_00);
  assert.equal(b.over, false);
  const over = budgetState({ limit: 10000_00, period: 'day' }, l, 8000_00, at(10, 3));
  assert.equal(over.over, true);
  assert.equal(over.excess, 1000_00);
  assert.equal(over.periodOver, true);
});

test('límite mensual: sugiere por día con lo que queda, sin contar hoy, redondeado a pesos', () => {
  // 1 al 2 de octubre gastó 100.000; quedan 29 días (3 al 31) y 300.000
  const l = ledger(buy('2026-10-01', 60000_00), buy('2026-10-02', 40000_00), buy('2026-09-30', 99999_00), buy('2026-10-03', 4000_00));
  const b = budgetState({ limit: 400000_00, period: 'month' }, l, 2000_00, at(10, 3));
  assert.equal(b.daysLeft, 29);
  assert.equal(b.daily, 1034400); // 300.000 / 29 = 10.344,83 → 10.344
  assert.equal(b.spentToday, 6000_00);
  assert.equal(b.remaining, 1034400 - 6000_00);
  assert.equal(b.periodSpent, 106000_00);
  assert.equal(b.periodRemaining, 294000_00);
  assert.equal(b.over, false);
  assert.equal(b.periodOver, false);
  // Lo que se gasta hoy no achica la sugerencia de hoy
  assert.equal(budgetState({ limit: 400000_00, period: 'month' }, l, 50000_00, at(10, 3)).daily, 1034400);
});

test('límite semanal: pasarse de lo sugerido hoy no es pasarse de la semana; y si ya se pasó, sugiere 0', () => {
  const l = ledger(buy('2026-09-28', 50000_00));
  const b = budgetState({ limit: 70000_00, period: 'week' }, l, 15000_00, at(10, 3));
  assert.equal(b.daily, 10000_00); // 20.000 en 2 días
  assert.equal(b.over, true);
  assert.equal(b.excess, 5000_00);
  assert.equal(b.periodOver, false);
  const gone = budgetState({ limit: 40000_00, period: 'week' }, l, 0, at(10, 3));
  assert.equal(gone.daily, 0);
  assert.equal(gone.over, false);
  assert.equal(gone.remaining, 0);
  assert.equal(gone.periodOver, true);
});

test('sin límite no hay estado', () => {
  assert.equal(budgetState({ limit: null, period: 'day' }, ledger(), 100), null);
});
