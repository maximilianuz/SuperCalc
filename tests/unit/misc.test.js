import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { formatMoney, parseMoneyInput, centsToInput, formatPercent } from '../../www/js/money.js';
import { sanitizeList, totals, findSame, limitState } from '../../www/js/list.js';
import { checkDigitOk, normalizeCode } from '../../www/js/ean.js';

test('formato de dinero «$ 1.299,50»', () => {
  assert.equal(formatMoney(129950), '$ 1.299,50');
  assert.equal(formatMoney(0), '$ 0,00');
  assert.equal(formatMoney(5), '$ 0,05');
  assert.equal(formatMoney(123456789), '$ 1.234.567,89');
  assert.equal(formatMoney(-2500), '−$ 25,00');
});

test('entrada de precios', () => {
  assert.equal(parseMoneyInput('1299'), 129900);
  assert.equal(parseMoneyInput('1.299,50'), 129950);
  assert.equal(parseMoneyInput('1299,5'), 129950);
  assert.equal(parseMoneyInput('1299.50'), 129950);
  assert.equal(parseMoneyInput('1.299'), 129900);
  assert.equal(parseMoneyInput('$ 850'), 85000);
  assert.equal(parseMoneyInput('0,99'), 99);
  assert.equal(parseMoneyInput(''), null);
  assert.equal(parseMoneyInput('abc'), null);
  assert.equal(parseMoneyInput('1,2,3'), null);
  assert.equal(parseMoneyInput('12.34.5'), null);
  assert.equal(centsToInput(129950), '1299,50');
  assert.equal(centsToInput(129900), '1299');
});

test('porcentaje con coma decimal', () => {
  assert.equal(formatPercent(8.2), '8,2 %');
  assert.equal(formatPercent(-10), '10,0 %');
  assert.equal(formatPercent(0.01), '0,1 %');
});

test('lista: totales, merge y límite', () => {
  const l = sanitizeList({
    items: [
      { id: 'a', name: 'Yerba', code: '', cents: 4000, qty: 2 },
      { id: 'b', name: '', code: '7790387000165', cents: 1000, qty: 1 },
    ],
    limit: 8000,
  });
  assert.deepEqual(totals(l), { cents: 9000, units: 3, count: 2 });
  assert.equal(findSame(l, { name: 'YERBA', cents: 4000 })?.id, 'a');
  assert.equal(findSame(l, { name: 'Yerba', cents: 4100 }), null);
  assert.equal(findSame(l, { name: 'Otro', code: '7790387000165', cents: 1000 })?.id, 'b');
  assert.equal(findSame(l, { name: '', cents: 1000 }), null, 'sin nombre ni código no se une');
  assert.deepEqual(limitState(l), { limit: 8000, total: 9000, over: true, remaining: 0, excess: 1000 });
});

test('lista: lectura defensiva', () => {
  assert.deepEqual(sanitizeList(null), { items: [], limit: null });
  assert.deepEqual(sanitizeList({ items: 'x', limit: -5 }), { items: [], limit: null });
  const l = sanitizeList({ items: [{ id: 'a', cents: 1.5, qty: 1 }, { id: 'b', cents: 100, qty: 0 }, { id: 'c', cents: 100, qty: 1, code: 'zz' }] });
  assert.equal(l.items.length, 1);
  assert.equal(l.items[0].code, '');
});

test('dígito verificador EAN/UPC', () => {
  assert.ok(checkDigitOk('4006381333931'));
  assert.ok(!checkDigitOk('4006381333932'));
  assert.ok(checkDigitOk('96385074'));
  assert.ok(checkDigitOk('036000291452'));
  assert.equal(normalizeCode('036000291452'), '0036000291452');
  assert.equal(normalizeCode('4006381333932'), null);
});

test('el service worker precachea todos los archivos de www/', () => {
  const www = new URL('../../www/', import.meta.url).pathname;
  const files = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(relative(www, p));
    }
  };
  walk(www);
  const sw = readFileSync(join(www, 'sw.js'), 'utf8');
  const missing = files.filter((f) => f !== 'sw.js' && !sw.includes(`'${f}'`));
  assert.deepEqual(missing, []);
});

test('ningún recurso externo en el HTML/CSS/JS de la app', () => {
  const www = new URL('../../www/', import.meta.url).pathname;
  for (const f of ['index.html', 'css/app.css', 'js/app.js', 'js/ocr.js', 'js/barcode.js', 'sw.js', 'manifest.webmanifest']) {
    const src = readFileSync(join(www, f), 'utf8');
    assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(src), `${f} referencia una URL externa`);
  }
});
