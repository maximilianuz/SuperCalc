import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeWords, mergeReadings, priceFromWords, parsePriceNumber, groupRows, rulesIn, normalizeText } from '../../www/js/priceparser.js';

// Arma palabras con caja a partir de renglones: [y, alto, [[texto, x], ...]]
function words(lines) {
  const out = [];
  for (const [y, h, ws] of lines) {
    for (const [text, x, hh = h, dy = 0] of ws) {
      out.push({ text, bbox: { x0: x, y0: y + dy, x1: x + text.length * hh * 0.55, y1: y + dy + hh }, confidence: 90 });
    }
  }
  return out;
}
const read = (lines, scale = 1) => priceFromWords([{ words: words(lines), scale }]);
const cents = (r) => r.candidates.map((c) => c.cents);

test('parsePriceNumber: formatos argentinos y errores de OCR', () => {
  assert.equal(parsePriceNumber('1.299,50'), 129950);
  assert.equal(parsePriceNumber('1.299'), 129900);
  assert.equal(parsePriceNumber('1299,5'), 129950);
  assert.equal(parsePriceNumber('1299.50'), 129950);
  assert.equal(parsePriceNumber('1.299.50'), 129950);
  assert.equal(parsePriceNumber('12.345.678'), 1234567800);
  assert.equal(parsePriceNumber('850'), 85000);
  assert.equal(parsePriceNumber('77908950009'), null); // parece un código, no un precio
});

test('normalizeText quita tildes y pasa a minúsculas', () => {
  assert.equal(normalizeText('PRECIO SIN IMPUESTOS NACIONALES Ñ'), 'precio sin impuestos nacionales n');
});

test('reglas de texto', () => {
  assert.deepEqual(rulesIn('precio mayorista'), ['mayorista']);
  assert.deepEqual(rulesIn('llevando 6 unidades'), ['mayorista']);
  assert.deepEqual(rulesIn('x 6 un'), ['mayorista']);
  assert.deepEqual(rulesIn('comprando por cantidad'), ['mayorista']);
  assert.ok(rulesIn('2x1 en toda la linea').includes('promo'));
  assert.ok(!rulesIn('2x1').includes('mayorista'));
  assert.deepEqual(rulesIn('20% off'), ['promo']);
  assert.deepEqual(rulesIn('segunda unidad al 70'), ['promo']);
  assert.deepEqual(rulesIn('12 cuotas sin interes'), ['cuotas']);
  assert.deepEqual(rulesIn('x 12'), ['cuotas']);
  assert.deepEqual(rulesIn('precio por kg'), ['medida']);
  assert.deepEqual(rulesIn('precio por 100 g'), ['medida']);
  assert.deepEqual(rulesIn('por lt'), ['medida']);
  assert.deepEqual(rulesIn('por unidad'), ['medida']);
  assert.deepEqual(rulesIn('precio sin impuestos nacionales'), ['sinImpuestos']);
  assert.deepEqual(rulesIn('antes'), ['anterior']);
  assert.deepEqual(rulesIn('precio anterior'), ['anterior']);
  assert.deepEqual(rulesIn('aceite girasol 900 ml'), []);
  assert.deepEqual(rulesIn('yerba mate 1 kg'), []);
});

test('agrupa renglones por solapamiento vertical', () => {
  const rows = groupRows(
    words([
      [0, 20, [['Yerba', 0], ['Mate', 80]]],
      [40, 100, [['$', 0, 50], ['1.299', 60]]],
    ]),
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0].text, 'Yerba Mate');
  assert.equal(rows[1].text, '$ 1.299');
});

test('precio grande simple con «$»', () => {
  const r = read([
    [0, 24, [['Yerba', 10], ['Playadito', 90], ['1', 260], ['kg', 280]]],
    [50, 120, [['$', 10, 70, 10], ['4.250', 70]]],
    [200, 18, [['7790387000165', 10]]],
  ]);
  assert.equal(r.suggested.cents, 425000);
  assert.deepEqual(r.suggested.own, []);
  assert.ok(!cents(r).includes(100), 'el «1 kg» no es precio');
});

test('centavos en superíndice', () => {
  const r = read([[0, 120, [['$', 0, 70], ['1.299', 60], ['50', 60 + 5 * 66 + 8, 50]]]]);
  assert.equal(r.suggested.cents, 129950);
});

test('números sin «$» chicos se descartan; unidades pegadas no son precios', () => {
  const r = read([
    [0, 20, [['Aceite', 0], ['900', 90], ['ml', 140]]],
    [30, 20, [['Gaseosa', 0], ['2,25', 100], ['lt', 150]]],
    [60, 20, [['Cont.', 0], ['900mi', 60]]],
    [90, 20, [['Botella', 0], ['500', 90], ['m1', 140]]],
    [120, 20, [['Leche', 0], ['1', 70], ['ni', 90]]],
    [150, 20, [['Pack', 0], ['x', 60], ['6', 80]]],
    [200, 100, [['$', 0, 60], ['2.890', 50]]],
    [320, 20, [['Oferta', 0], ['15', 80]]],
  ]);
  assert.deepEqual(cents(r), [289000]);
});

test('número sin «$» con letra mucho más chica que la mayor se descarta', () => {
  const r = read([
    [0, 120, [['$', 0, 70], ['3.100', 70]]],
    [150, 30, [['2.500', 0]]],
  ]);
  assert.deepEqual(cents(r), [310000]);
});

test('mayorista arriba: regla cercana → advertencia, no «a confirmar»', () => {
  const r = read([
    [0, 30, [['PRECIO', 0], ['MAYORISTA', 120]]],
    [45, 110, [['$', 0, 60], ['1.850', 60]]],
  ]);
  assert.equal(r.suggested.cents, 185000);
  assert.deepEqual(r.suggested.own, []);
  assert.deepEqual(r.suggested.near, ['mayorista']);
  assert.ok(r.warnings.some((w) => w.includes('mayorista')));
});

test('regla en el mismo renglón o el de abajo → propia', () => {
  const r = read([
    [0, 110, [['$', 0, 60], ['9.990', 60], ['x', 420, 30], ['kg', 450, 30]]],
    [200, 60, [['$', 0, 40], ['2.497', 50]]],
    [270, 22, [['Precio', 0], ['por', 80], ['100', 120], ['g', 170]]],
  ]);
  const byC = Object.fromEntries(r.candidates.map((c) => [c.cents, c]));
  assert.deepEqual(byC[999000].own, ['medida']);
  assert.deepEqual(byC[249700].own, ['medida']);
  assert.equal(r.suggested, null, 'todos tienen regla propia: no se sugiere ninguno');
  assert.ok(r.warnings.some((w) => w.includes('condiciones')));
});

test('prefiere el precio más grande sin regla propia', () => {
  const r = read([
    [0, 140, [['$', 0, 80], ['5.400', 80]]],
    [150, 24, [['Llevando', 0], ['3', 110], ['unidades', 130]]],
    [220, 90, [['$', 0, 50], ['6.100', 50]]],
    [330, 20, [['Precio', 0], ['sin', 70], ['impuestos', 110], ['nacionales', 210], ['$', 330], ['5.041,32', 345]]],
  ]);
  const byC = Object.fromEntries(r.candidates.map((c) => [c.cents, c]));
  assert.deepEqual(byC[540000].own, ['mayorista']);
  assert.deepEqual(byC[504132].own, ['sinImpuestos']);
  // La línea de abajo tiene su propio precio: la regla no se le atribuye al 6.100
  assert.deepEqual(byC[610000].own, []);
  assert.equal(r.suggested.cents, 610000);
});

test('regla sola en el renglón de abajo (sin precio propio) es propia', () => {
  const r = read([
    [0, 120, [['$', 0, 70], ['7.300', 70]]],
    [130, 22, [['Precio', 0], ['sin', 80], ['impuestos', 120], ['nacionales', 230]]],
  ]);
  assert.deepEqual(r.candidates[0].own, ['sinImpuestos']);
  assert.equal(r.suggested, null);
});

test('«$» leído como «5»: ofrece ambas lecturas y avisa', () => {
  const r = read([[0, 120, [['51.299', 0]]]]);
  assert.deepEqual(cents(r).sort(), [129900, 5129900].sort());
  assert.equal(r.suggested.cents, 129900);
  assert.ok(r.warnings.some((w) => w.includes('«5»')));

  const r2 = read([[0, 120, [['5', 0], ['2.340', 80]]]]);
  assert.ok(cents(r2).includes(234000));
  assert.ok(cents(r2).includes(5234000));
  assert.equal(r2.suggested.cents, 234000);
});

test('«$» leído como «S» o «§»', () => {
  const r = read([[0, 120, [['S1.150', 0]]]]);
  assert.equal(r.suggested.cents, 115000);
  assert.ok(r.warnings.some((w) => w.includes('«S»')));
  const r2 = read([[0, 120, [['§', 0], ['899,90', 60]]]]);
  assert.equal(r2.suggested.cents, 89990);
});

test('sin precios → lista vacía y sin sugerido', () => {
  const r = read([[0, 30, [['Yerba', 0], ['mate', 100], ['suave', 200]]]]);
  assert.equal(r.candidates.length, 0);
  assert.equal(r.suggested, null);
});

test('une lecturas de varias escalas por centavos y normaliza la altura', () => {
  const a = analyzeWords(words([[0, 120, [['$', 0, 60], ['2.100', 60]]]]), 1);
  const b = analyzeWords(words([[0, 70, [['$', 0, 35], ['2.100', 35]]]]), 700 / 1200);
  const c = analyzeWords(words([[0, 40, [['$', 0, 20], ['2.700', 20]]]]), 400 / 1200);
  const m = mergeReadings([a, b, c]);
  const byC = Object.fromEntries(m.candidates.map((x) => [x.cents, x]));
  assert.equal(byC[210000].seen, 2);
  assert.ok(Math.abs(byC[210000].h - 120) < 1);
  assert.ok(Math.abs(byC[270000].h - 120) < 1);
});

test('promo y cuotas en el mismo renglón marcan a confirmar', () => {
  const r = read([
    [0, 100, [['$', 0, 60], ['3.500', 60]]],
    [110, 26, [['2x1', 0], ['llevando', 60], ['dos', 160]]],
    [300, 100, [['$', 0, 60], ['45.000', 60]]],
    [410, 26, [['12', 0], ['cuotas', 40], ['sin', 120], ['interés', 160]]],
  ]);
  const byC = Object.fromEntries(r.candidates.map((c) => [c.cents, c]));
  assert.ok(byC[350000].own.includes('promo'));
  assert.ok(byC[4500000].own.includes('cuotas'));
});

test('precio anterior («antes») en el mismo renglón', () => {
  const r = read([
    [0, 40, [['Antes', 0], ['$', 140], ['2.000', 170]]],
    [80, 120, [['$', 0, 70], ['1.600', 70]]],
  ]);
  const byC = Object.fromEntries(r.candidates.map((c) => [c.cents, c]));
  assert.deepEqual(byC[200000].own, ['anterior']);
  assert.deepEqual(byC[160000].near, ['anterior']);
  assert.equal(r.suggested.cents, 160000);
});

test('fechas y porcentajes no son precios', () => {
  const r = read([
    [0, 30, [['Vence', 0], ['03/10/2026', 100]]],
    [40, 30, [['Hasta', 0], ['30%', 100]]],
    [100, 100, [['$', 0, 60], ['999', 60]]],
  ]);
  assert.deepEqual(cents(r), [99900]);
});

test('una palabra chica dentro del ancho del número no son centavos', () => {
  const r = read([[138, 160, [['$', 137, 167, -25], ['3.450', 233], ['11', 334, 19, -8]]]]);
  assert.equal(r.suggested.cents, 345000);
});

test('une «3» y «450» vecinos de la misma altura (punto de miles perdido)', () => {
  const r = read([[0, 200, [['$', 0, 120, 30], ['3', 90], ['450', 90 + 110 + 30]]]]);
  assert.equal(r.suggested.cents, 345000);
  // Pero no une números lejanos ni de distinta altura
  const r2 = read([[0, 200, [['$', 0, 120, 30], ['3.100', 90], ['250', 900, 60]]]]);
  assert.equal(r2.suggested.cents, 310000);
});

test('«$» adivinado (5) con monto chico no vale; varias escalas le ganan a una sola', () => {
  const r = read([[0, 200, [['53', 0]]]]);
  assert.ok(!r.candidates.some((c) => c.cents === 300));
  const a = analyzeWords(words([[0, 120, [['$', 0, 60], ['2.100', 60]]]]), 1);
  const b = analyzeWords(words([[0, 70, [['$', 0, 35], ['2.100', 35]]]]), 700 / 1200);
  const c = analyzeWords(words([[0, 50, [['$', 0, 30], ['9.100', 30]]]]), 400 / 1200);
  const m = mergeReadings([a, b, c]);
  assert.equal(m.suggested.cents, 210000);
});
