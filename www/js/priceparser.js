// Interpreta las palabras que devuelve el OCR (texto + caja) y propone precios.
// Módulo puro: no toca el DOM, se prueba en Node.

export const RULES = [
  {
    id: 'mayorista',
    label: 'precio mayorista o por cantidad',
    re: [
      /mayor[il1|]sta/,
      /llevando\s*\d+/,
      /(?<![\d]\s?)\bx\s?\d{1,2}\s*(?:u\b|un\b|uni|unid|unidades)/,
      /(?<![\d]\s?)\bx\s?(?:[2-9]|1[01]|1[3-9]|[2-9]\d)\b(?!\s*(?:cuota|ml|mi|m1|cc|g|gr|kg|l|lt|cm))/,
      /por\s*cantidad/,
      /\bpor\s*bulto/,
    ],
  },
  {
    id: 'promo',
    label: 'promoción u oferta',
    re: [
      /\b\d\s?x\s?\d\b/,
      /\d+\s?%\s?(?:off|dto|desc)/,
      /%\s?off/,
      /\d+\s?%/,
      /segunda\s*unidad/,
      /\b2(?:da|°|º)\s*unidad/,
      /\boferta/,
      /\bpromo/,
      /descuento/,
    ],
  },
  {
    id: 'cuotas',
    label: 'precio en cuotas',
    re: [/cuotas?\b/, /(?<![\d]\s?)\bx\s?(?:12|18|24)\b/, /sin\s*inter[eé]s/, /\bs\/\s?int/],
  },
  {
    id: 'medida',
    label: 'precio por unidad de medida',
    re: [
      /\bpor\s*(?:kg|kilo|kilogramo|lt|litro|l\b|100\s?(?:g|gr|grs|ml|cc)\b|unidad|un\b|metro|m2)/,
      /\b(?:x|el|precio\s*x)\s*(?:kg|kilo|lt|litro)\b/,
      /\$\s?\/\s?(?:kg|lt|l\b|un)/,
      /\/\s?(?:kg|lt)\b/,
      /unidad\s*de\s*medida/,
    ],
  },
  {
    id: 'sinImpuestos',
    label: 'precio sin impuestos nacionales',
    re: [/sin\s*impuestos/, /imp(?:uestos)?\.?\s*nac/, /sin\s*imp\b/, /s\/\s?imp/],
  },
  {
    id: 'anterior',
    label: 'precio anterior',
    re: [/\bantes\b/, /precio\s*anterior/, /\banterior\b/],
  },
];

export const RULE_LABELS = Object.fromEntries(RULES.map((r) => [r.id, r.label]));

export function normalizeText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function cleanWord(w) {
  const t = String(w.text || '').trim();
  if (!t) return null;
  const { x0, y0, x1, y1 } = w.bbox || {};
  if (![x0, y0, x1, y1].every(Number.isFinite) || x1 <= x0 || y1 <= y0) return null;
  // Ruido típico del modo disperso: un signo suelto con baja confianza.
  if (!/[\p{L}\p{N}$§%]/u.test(t) && (w.confidence ?? 100) < 50) return null;
  // Basura pegada antes del signo: «s$4.250» → «$4.250»
  let text = t.replace(/^[a-zA-Z]{1,2}(?=[$§]\d)/, '');
  // En palabras casi numéricas corregimos confusiones comunes (O→0, l/I→1).
  if (/\d/.test(text) && /^[$§sS5]?[\d.,oOlI|]+$/.test(text)) {
    const digits = (text.match(/\d/g) || []).length;
    if (digits >= 2) text = text.replace(/[oO]/g, '0').replace(/[lI|]/g, '1');
  }
  return { text, x0, y0, x1, y1, h: y1 - y0, cy: (y0 + y1) / 2 };
}

export function groupRows(words) {
  const ws = words.map(cleanWord).filter(Boolean).sort((a, b) => a.cy - b.cy);
  const rows = [];
  for (const w of ws) {
    let best = null;
    let bestOv = 0;
    for (const r of rows) {
      const ov = Math.min(w.y1, r.y1) - Math.max(w.y0, r.y0);
      const rel = ov / Math.min(w.h, r.y1 - r.y0);
      if (rel >= 0.5 && rel > bestOv) {
        best = r;
        bestOv = rel;
      }
    }
    if (best) {
      best.words.push(w);
      best.y0 = Math.min(best.y0, w.y0);
      best.y1 = Math.max(best.y1, w.y1);
    } else {
      rows.push({ words: [w], y0: w.y0, y1: w.y1 });
    }
  }
  rows.sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  for (const r of rows) {
    r.words.sort((a, b) => a.x0 - b.x0);
    r.words = joinSplitThousands(r.words);
    r.text = r.words.map((w) => w.text).join(' ');
    r.norm = normalizeText(r.text);
    r.h = Math.max(...r.words.map((w) => w.h));
    r.rules = rulesIn(r.norm);
  }
  return rows;
}

// El OCR a veces pierde el punto de miles y parte «3.450» en «3» y «450».
// Si son vecinos, de la misma altura y casi pegados, los unimos.
function joinSplitThousands(words) {
  const out = [];
  for (const w of words) {
    const prev = out[out.length - 1];
    if (
      prev &&
      /^[$§]?\d{1,3}[.,]?$/.test(prev.text) &&
      /^\d{3}(?:[.,]\d{1,2})?$/.test(w.text) &&
      Math.abs(prev.h - w.h) < 0.25 * Math.max(prev.h, w.h) &&
      w.x0 - prev.x1 < 0.5 * Math.max(prev.h, w.h) &&
      w.x0 - prev.x1 > -0.2 * w.h
    ) {
      const y0 = Math.min(prev.y0, w.y0);
      const y1 = Math.max(prev.y1, w.y1);
      out[out.length - 1] = { text: `${prev.text.replace(/[.,]$/, '')}.${w.text}`, x0: prev.x0, x1: w.x1, y0, y1, h: Math.max(prev.h, w.h), cy: (y0 + y1) / 2 };
      continue;
    }
    out.push(w);
  }
  return out;
}

export function rulesIn(norm) {
  const found = [];
  for (const rule of RULES) {
    if (rule.re.some((re) => re.test(norm))) found.push(rule.id);
  }
  return found;
}

// «1.299,50» «1299.50» «1.299» «12,5» → centavos. null si no parece un monto.
export function parsePriceNumber(num) {
  let m = /^(\d{1,3}(?:[.,]\d{3})+)(?:[.,](\d{1,2}))?$/.exec(num);
  if (m) {
    const pesos = Number(m[1].replace(/[.,]/g, ''));
    return pesos * 100 + Number(((m[2] || '') + '00').slice(0, 2));
  }
  m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(num);
  if (m) {
    if (m[1].length > 7) return null;
    return Number(m[1]) * 100 + Number(((m[2] || '') + '00').slice(0, 2));
  }
  return null;
}

const UNIT_AFTER =
  /^\s?(?:ml|mi|m1|ni|nl|mll|cc|c\.c|l|lt|lts|litros?|g|gr|grs|gramos?|kg|kgs|kilos?|k|cm|mm|mts?|m|un|u|uds?|unid|unidades|%|cuotas?|hs|min)(?![a-z])/;
const MAX_CENTS = 10_000_000_00;
export const MIN_PX = 14;

// Saca candidatos de un renglón. Devuelve [{cents, h, currency, flags, rowIndex}].
function candidatesInRow(row, rowIndex) {
  // Texto del renglón con mapa carácter → palabra
  let str = '';
  const owner = [];
  row.words.forEach((w, i) => {
    if (i) {
      str += ' ';
      owner.push(-1);
    }
    for (const ch of w.text) {
      str += ch;
      owner.push(i);
    }
  });
  const low = str.toLowerCase();
  const re = /(?<![a-z0-9.,/:§$])([$§]|s(?=\s?\d))?\s?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![\d/:])/g;
  const raw = [];
  let m;
  while ((m = re.exec(low))) {
    const start = m.index;
    const end = start + m[0].length;
    const numStart = end - m[2].length;
    const wordIdx = new Set();
    for (let k = start; k < end; k++) if (owner[k] >= 0) wordIdx.add(owner[k]);
    const numWords = new Set();
    for (let k = numStart; k < end; k++) if (owner[k] >= 0) numWords.add(owner[k]);
    const h = Math.max(...[...numWords].map((i) => row.words[i].h));
    raw.push({
      sym: m[1] || null,
      num: m[2],
      start,
      end,
      numWords: [...numWords],
      lastWord: Math.max(...wordIdx),
      h,
      before: low.slice(0, start),
      after: low.slice(end),
    });
  }

  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const r = raw[i];
    // «5» suelto delante de un número de altura parecida: probablemente es «$».
    if (!r.sym && r.num === '5' && raw[i + 1] && !raw[i + 1].sym && raw[i + 1].start === r.end + 1) {
      const nx = raw[i + 1];
      if (nx.h >= r.h * 0.6 && nx.h <= r.h * 1.6) {
        nx.fiveWord = true;
        continue;
      }
    }
    let currency = r.sym === '$' ? '$' : r.sym ? 'S' : null;
    let cents = parsePriceNumber(r.num);
    if (cents == null) continue;

    // Centavos en superíndice: «1.299» seguido de un «50» más chico arriba a la derecha.
    if (!/[.,]\d{1,2}$/.test(r.num) || /[.,]\d{3}$/.test(r.num)) {
      const main = row.words[r.numWords[r.numWords.length - 1]];
      const next = row.words[r.lastWord + 1];
      if (
        main &&
        next &&
        /^\d{2}$/.test(next.text) &&
        next.h < main.h * 0.8 &&
        next.x0 >= main.x1 - main.h * 0.1 &&
        next.x0 - main.x1 < main.h * 0.6 &&
        next.y0 >= main.y0 - main.h * 0.15 &&
        next.y0 <= main.y0 + main.h * 0.35 &&
        raw[i + 1] &&
        raw[i + 1].numWords.includes(r.lastWord + 1)
      ) {
        cents += Number(next.text);
        raw[i + 1].consumed = true;
      }
    }
    if (r.consumed) continue;

    const flags = [];
    if (currency === 'S') flags.push('sAsDollar');
    const explicit = currency === '$';
    if (!explicit) {
      if (UNIT_AFTER.test(r.after)) continue;
      if (/(?:\bx|\bpor|\bcont\.?|\bneto)\s?$/.test(r.before)) continue;
    }

    const base = { h: r.h, rowIndex, flags };
    if (r.fiveWord) {
      out.push({ ...base, cents, currency: '5', flags: [...flags, 'dollarAsFive'] });
      const alt = parsePriceNumber('5' + r.num);
      if (alt != null) out.push({ ...base, cents: alt, currency: null, flags: [...flags, 'dollarAsFive'] });
      continue;
    }
    if (!currency && /^5\d/.test(r.num)) {
      const stripped = r.num.slice(1);
      const sc = /^[.,]/.test(stripped) ? null : parsePriceNumber(stripped);
      if (sc != null) {
        out.push({ ...base, cents, currency: null, flags: [...flags, 'dollarAsFive'] });
        out.push({ ...base, cents: sc, currency: '5', flags: [...flags, 'dollarAsFive'] });
        continue;
      }
    }
    out.push({ ...base, cents, currency });
  }
  return out.filter((c) => c.cents > 0 && c.cents <= MAX_CENTS);
}

// Analiza las palabras de UNA lectura (una escala). `scale` = píxeles de la imagen
// procesada por píxel de la imagen original: las alturas se normalizan dividiendo.
export function analyzeWords(words, scale = 1) {
  const rows = groupRows(words || []);
  let cands = [];
  rows.forEach((row, i) => {
    for (const c of candidatesInRow(row, i)) cands.push(c);
  });
  // Renglones que tienen un precio escrito (aunque esta lectura después no se use)
  const rowsWithPrice = new Set(cands.filter((c) => c.currency || c.cents >= 2000).map((c) => c.rowIndex));
  // Con menos de ~14 px de alto en esta escala el OCR confunde dígitos: no se usa esa lectura.
  cands = cands.filter((c) => c.h >= MIN_PX);
  if (!cands.length) return { rows, candidates: [] };
  const maxH = Math.max(...cands.map((c) => c.h));
  cands = cands.filter((c) => {
    if (c.currency === '$') return true;
    if (c.cents < 2000) return false;
    // «$» adivinado (leído como 5, S o §): vale el mínimo pero no el filtro de altura
    if (c.currency) return true;
    if (c.h < maxH * 0.5) return false;
    return true;
  });
  for (const c of cands) {
    const row = rows[c.rowIndex];
    const own = new Set(row.rules);
    const below = rows[c.rowIndex + 1];
    // El renglón de abajo cuenta como propio, salvo que tenga su propio precio
    // (p. ej. «Precio sin impuestos nacionales $ 5.041»): ahí la regla describe a ese otro precio.
    if (below && below.y0 - row.y1 < c.h * 2.5 && !rowsWithPrice.has(c.rowIndex + 1)) below.rules.forEach((id) => own.add(id));
    const near = new Set();
    const above = rows[c.rowIndex - 1];
    if (above && row.y0 - above.y1 < c.h * 2.5) {
      above.rules.forEach((id) => {
        if (!own.has(id)) near.add(id);
      });
    }
    c.own = [...own];
    c.near = [...near];
    c.h = c.h / scale;
  }
  return { rows, candidates: cands };
}

const CURRENCY_RANK = { $: 3, S: 2, 5: 1 };

// Une los candidatos de varias lecturas por centavos y elige el sugerido.
export function mergeReadings(readings) {
  const byCents = new Map();
  const allRules = new Set();
  for (const rd of readings) {
    for (const row of rd.rows || []) row.rules.forEach((id) => allRules.add(id));
    for (const c of rd.candidates || []) {
      let m = byCents.get(c.cents);
      if (!m) {
        m = { cents: c.cents, h: 0, currency: null, own: new Set(), near: new Set(), flags: new Set(), seen: 0 };
        byCents.set(c.cents, m);
      }
      m.h = Math.max(m.h, c.h);
      m.seen++;
      if ((CURRENCY_RANK[c.currency] || 0) > (CURRENCY_RANK[m.currency] || 0)) m.currency = c.currency;
      c.own.forEach((id) => m.own.add(id));
      c.near.forEach((id) => m.near.add(id));
      c.flags.forEach((f) => m.flags.add(f));
    }
  }
  const candidates = [...byCents.values()].map((m) => ({
    cents: m.cents,
    h: m.h,
    currency: m.currency,
    own: [...m.own],
    near: [...m.near].filter((id) => !m.own.has(id)),
    flags: [...m.flags],
    seen: m.seen,
  }));
  candidates.sort((a, b) => b.h - a.h || (CURRENCY_RANK[b.currency] || 0) - (CURRENCY_RANK[a.currency] || 0) || b.cents - a.cents);

  let suggested = null;
  for (const c of candidates) {
    if (c.own.length) continue;
    if (!suggested) {
      suggested = c;
      continue;
    }
    // Empate de altura (±4 %): gana el que tiene «$» visible.
    if (c.h >= suggested.h * 0.96 && (CURRENCY_RANK[c.currency] || 0) > (CURRENCY_RANK[suggested.currency] || 0)) suggested = c;
  }
  // Uno visto en una sola escala no le gana a otro confirmado por varias si su altura es comparable
  if (suggested && suggested.seen === 1) {
    const solid = candidates.find((c) => !c.own.length && c.seen >= 2 && c.h >= suggested.h * 0.6);
    if (solid) suggested = solid;
  }
  for (const c of candidates) c.suggested = c === suggested;
  if (suggested) {
    candidates.splice(candidates.indexOf(suggested), 1);
    candidates.unshift(suggested);
  }

  const warnings = [];
  if (candidates.some((c) => c.flags.includes('dollarAsFive'))) {
    warnings.push('El «$» pudo leerse como «5»: te mostramos las dos lecturas, revisá cuál es la correcta.');
  }
  if (candidates.some((c) => c.flags.includes('sAsDollar'))) {
    warnings.push('Tomamos una «S» o «§» como si fuera «$». Revisá el monto.');
  }
  if (suggested && suggested.near.length) {
    warnings.push(`Cerca del precio dice ${suggested.near.map((id) => `«${RULE_LABELS[id]}»`).join(', ')}. Revisá que sea el precio final.`);
  }
  if (candidates.length && !suggested) {
    warnings.push('Todos los precios que leímos tienen condiciones (promo, mayorista, por kg…). Elegí uno con cuidado o cargalo a mano.');
  }
  return { candidates, suggested, warnings, rules: [...allRules] };
}

export function priceFromWords(wordsByScale) {
  return mergeReadings(wordsByScale.map(({ words, scale }) => analyzeWords(words, scale)));
}
