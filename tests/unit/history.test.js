import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyStore,
  recordPrice,
  revertRecord,
  comparePrice,
  relativeTime,
  productKey,
  normalizeName,
  sanitizeStore,
  summary,
  lastChange,
  cumulativeChange,
  deletePoint,
  deleteProduct,
  MAX_POINTS,
} from '../../www/js/history.js';

const DAY = 86_400_000;
const T0 = new Date(2026, 8, 1, 12, 0, 0).getTime(); // 1 sep 2026, 12:00 local

test('clave por código o por nombre normalizado (minúsculas, sin tildes)', () => {
  assert.equal(productKey({ name: 'Azúcar  Ledesma 1 KG' }), 'n:azucar ledesma 1 kg');
  assert.equal(productKey({ name: 'azucar ledesma 1 kg' }), productKey({ name: 'AZÚCAR LEDESMA 1 kg' }));
  assert.equal(productKey({ name: 'Yerba', code: '7790387000165' }), 'c:7790387000165');
  assert.equal(productKey({ name: '   ' }), null);
  assert.equal(normalizeName('Café — Molido'), 'cafe molido');
});

test('mismo precio que el último → solo actualiza s; distinto → punto nuevo', () => {
  let s = emptyStore();
  s = recordPrice(s, { name: 'Leche', cents: 120000, now: T0 }).store;
  s = recordPrice(s, { name: 'leche', cents: 120000, now: T0 + 3 * DAY }).store;
  let p = s.products['n:leche'];
  assert.equal(p.points.length, 1);
  assert.deepEqual(p.points[0], { c: 120000, t: T0, s: T0 + 3 * DAY });
  s = recordPrice(s, { name: 'Leche', cents: 130000, now: T0 + 10 * DAY }).store;
  p = s.products['n:leche'];
  assert.equal(p.points.length, 2);
  assert.deepEqual(p.points[1], { c: 130000, t: T0 + 10 * DAY, s: T0 + 10 * DAY });
});

test('recordPrice no modifica el store original', () => {
  const s0 = emptyStore();
  const s1 = recordPrice(s0, { name: 'Pan', cents: 100, now: T0 }).store;
  assert.deepEqual(s0.products, {});
  assert.ok(s1.products['n:pan']);
});

test('tope de 80 puntos (se descartan los más viejos)', () => {
  let s = emptyStore();
  for (let i = 0; i < 100; i++) s = recordPrice(s, { name: 'Arroz', cents: 1000 + i, now: T0 + i * DAY }).store;
  const pts = s.products['n:arroz'].points;
  assert.equal(MAX_POINTS, 80);
  assert.equal(pts.length, 80);
  assert.equal(pts[0].c, 1020);
  assert.equal(pts[79].c, 1099);
});

test('comparación: % contra el último precio guardado', () => {
  let s = emptyStore();
  s = recordPrice(s, { name: 'Fideos', cents: 100000, now: T0 }).store;
  s = recordPrice(s, { name: 'Fideos', cents: 110000, now: T0 + DAY }).store;
  const up = comparePrice(s, { name: 'FIDEOS', cents: 119020 });
  assert.equal(up.kind, 'up');
  assert.equal(up.prev, 110000);
  assert.ok(Math.abs(up.pct - 8.2) < 1e-9);
  const down = comparePrice(s, { name: 'fideos', cents: 99000 });
  assert.equal(down.kind, 'down');
  assert.ok(Math.abs(down.pct - -10) < 1e-9);
  assert.equal(comparePrice(s, { name: 'fideos', cents: 110000 }).kind, 'same');
  assert.equal(comparePrice(s, { name: 'otro', cents: 1 }).kind, 'new');
  assert.equal(up.since, T0 + DAY);
});

test('fechas relativas en español', () => {
  const now = new Date(2026, 9, 3, 9, 0).getTime();
  const d = (n, h = 20) => new Date(2026, 9, 3 - n, h, 0).getTime();
  assert.equal(relativeTime(now - 1000, now), 'hoy');
  assert.equal(relativeTime(d(1), now), 'ayer');
  assert.equal(relativeTime(d(2), now), 'hace 2 días');
  assert.equal(relativeTime(d(6), now), 'hace 6 días');
  assert.equal(relativeTime(d(7), now), 'hace 1 semana');
  assert.equal(relativeTime(d(21), now), 'hace 3 semanas');
  assert.equal(relativeTime(d(29), now), 'hace 4 semanas');
  assert.equal(relativeTime(d(30), now), 'hace 1 mes');
  assert.equal(relativeTime(d(95), now), 'hace 3 meses');
  assert.equal(relativeTime(d(365), now), 'hace 1 año');
  assert.equal(relativeTime(d(800), now), 'hace 2 años');
});

test('migración: aparece el código de un producto conocido por nombre', () => {
  let s = emptyStore();
  s = recordPrice(s, { name: 'Yerba Playadito', cents: 400000, now: T0 }).store;
  s = recordPrice(s, { name: 'Yerba Playadito', cents: 420000, now: T0 + 7 * DAY }).store;
  const cmp = comparePrice(s, { name: 'Yerba Playadito', code: '7790387000165', cents: 450000 });
  assert.equal(cmp.kind, 'up', 'compara contra el historial por nombre aunque ya tenga código');
  s = recordPrice(s, { name: 'Yerba Playadito', code: '7790387000165', cents: 450000, now: T0 + 14 * DAY }).store;
  assert.equal(s.products['n:yerba playadito'], undefined);
  const p = s.products['c:7790387000165'];
  assert.deepEqual(
    p.points.map((x) => x.c),
    [400000, 420000, 450000],
  );
  assert.equal(p.code, '7790387000165');
  assert.equal(p.name, 'Yerba Playadito');
});

test('migración con historial existente en ambas claves: une y ordena', () => {
  let s = emptyStore();
  s = recordPrice(s, { name: 'Café', code: '7790001000014', cents: 900, now: T0 + 2 * DAY }).store;
  s = recordPrice(s, { name: 'Café', cents: 800, now: T0 }).store; // el código no se cargó esta vez
  s = recordPrice(s, { name: 'Café', code: '7790001000014', cents: 950, now: T0 + 5 * DAY }).store;
  assert.deepEqual(Object.keys(s.products), ['c:7790001000014']);
  assert.deepEqual(
    s.products['c:7790001000014'].points.map((x) => x.c),
    [800, 900, 950],
  );
});

test('revertRecord deshace un registro (corrección de un artículo)', () => {
  let s = emptyStore();
  s = recordPrice(s, { name: 'Queso', cents: 500, now: T0 }).store;
  const r = recordPrice(s, { name: 'Queso', cents: 5000, now: T0 + DAY });
  assert.equal(r.rec.op, 'push');
  const back = revertRecord(r.store, r.rec);
  assert.deepEqual(back.products['n:queso'].points, [{ c: 500, t: T0, s: T0 }]);
  const t = recordPrice(s, { name: 'Queso', cents: 500, now: T0 + 2 * DAY });
  assert.equal(t.rec.op, 'touch');
  assert.equal(revertRecord(t.store, t.rec).products['n:queso'].points[0].s, T0);
  const n = recordPrice(emptyStore(), { name: 'Nuevo', cents: 10, now: T0 });
  assert.equal(revertRecord(n.store, n.rec).products['n:nuevo'], undefined);
});

test('resumen: subieron/bajaron según el último cambio (sin índice general)', () => {
  let s = emptyStore();
  s = recordPrice(s, { name: 'A', cents: 100, now: T0 }).store;
  s = recordPrice(s, { name: 'A', cents: 120, now: T0 + DAY }).store;
  s = recordPrice(s, { name: 'B', cents: 100, now: T0 }).store;
  s = recordPrice(s, { name: 'B', cents: 150, now: T0 + DAY }).store;
  s = recordPrice(s, { name: 'B', cents: 90, now: T0 + 2 * DAY }).store;
  s = recordPrice(s, { name: 'C', cents: 100, now: T0 }).store;
  assert.deepEqual(summary(s), { total: 3, up: 1, down: 1, unchanged: 1 });
  assert.deepEqual(Object.keys(summary(s)).sort(), ['down', 'total', 'unchanged', 'up']);
  assert.equal(lastChange(s.products['n:b']).kind, 'down');
  assert.ok(Math.abs(cumulativeChange(s.products['n:b']).pct - -10) < 1e-9);
});

test('borrar precio y producto', () => {
  let s = emptyStore();
  s = recordPrice(s, { name: 'X', cents: 100, now: T0 }).store;
  s = recordPrice(s, { name: 'X', cents: 200, now: T0 + DAY }).store;
  const s1 = deletePoint(s, 'n:x', 1);
  assert.deepEqual(s1.products['n:x'].points.map((p) => p.c), [100]);
  assert.equal(deletePoint(s1, 'n:x', 0).products['n:x'], undefined);
  assert.equal(deleteProduct(s, 'n:x').products['n:x'], undefined);
  assert.equal(s.products['n:x'].points.length, 2, 'el original no cambia (permite deshacer)');
});

test('lectura defensiva del historial', () => {
  assert.deepEqual(sanitizeStore(null), emptyStore());
  assert.deepEqual(sanitizeStore('basura'), emptyStore());
  assert.deepEqual(sanitizeStore({ products: [] }).products, {});
  const s = sanitizeStore({
    products: {
      'n:ok': { name: 'Ok', points: [{ c: 100, t: 5, s: 9 }, { c: 'x', t: 1 }, null, { c: 200, t: 2 }] },
      'n:mal': { name: 'Mal', points: 'no' },
      'n:vacio': { points: [] },
    },
  });
  assert.deepEqual(Object.keys(s.products), ['n:ok']);
  assert.deepEqual(s.products['n:ok'].points, [
    { c: 200, t: 2, s: 2 },
    { c: 100, t: 5, s: 9 },
  ]);
});
