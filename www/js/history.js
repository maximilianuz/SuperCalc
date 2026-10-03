// Productos conocidos e historial de precios. Módulo puro (sin DOM ni storage):
// recibe y devuelve objetos planos, así se prueba en Node.
//
// store = { v: 1, products: { [key]: { key, name, code, points: [{ c, t, s }] } } }
//   c: centavos · t: primera vez que se vio ese precio · s: última vez que se vio

export const MAX_POINTS = 80;
const DAY = 86_400_000;

export function emptyStore() {
  return { v: 1, products: {} };
}

export function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

export function productKey({ name, code } = {}) {
  if (code) return `c:${code}`;
  const n = normalizeName(name);
  return n ? `n:${n}` : null;
}

// Lectura defensiva: cualquier cosa rara se descarta sin romper.
export function sanitizeStore(raw) {
  const store = emptyStore();
  if (!raw || typeof raw !== 'object' || !raw.products || typeof raw.products !== 'object') return store;
  for (const [key, p] of Object.entries(raw.products)) {
    if (!p || typeof p !== 'object' || !Array.isArray(p.points)) continue;
    const points = p.points
      .filter((pt) => pt && Number.isSafeInteger(pt.c) && pt.c > 0 && Number.isFinite(pt.t))
      .map((pt) => ({ c: pt.c, t: pt.t, s: Number.isFinite(pt.s) && pt.s >= pt.t ? pt.s : pt.t }))
      .sort((a, b) => a.t - b.t)
      .slice(-MAX_POINTS);
    if (!points.length) continue;
    store.products[key] = {
      key,
      name: typeof p.name === 'string' ? p.name : '',
      code: typeof p.code === 'string' ? p.code : '',
      points,
    };
  }
  return store;
}

function clone(store) {
  return JSON.parse(JSON.stringify(store));
}

// Si aparece el código de un producto que conocíamos por nombre, unimos el historial.
function migrateNameToCode(products, name, code) {
  if (!code) return;
  const nk = productKey({ name });
  const ck = productKey({ code });
  if (!nk || !products[nk]) return;
  const from = products[nk];
  const to = products[ck];
  if (!to) {
    products[ck] = { ...from, key: ck, code };
  } else {
    const merged = [...to.points, ...from.points].sort((a, b) => a.t - b.t);
    const out = [];
    for (const pt of merged) {
      const last = out[out.length - 1];
      if (last && last.c === pt.c) last.s = Math.max(last.s, pt.s);
      else out.push({ ...pt });
    }
    to.points = out.slice(-MAX_POINTS);
    if (!to.name) to.name = from.name;
  }
  delete products[nk];
}

// Registra que se vio `cents` para el producto. Devuelve { store, rec } donde
// rec permite deshacer exactamente este registro (para correcciones).
export function recordPrice(store, { name, code, cents, now = Date.now() }) {
  const next = clone(store);
  const key = productKey({ name, code });
  if (!key || !Number.isSafeInteger(cents) || cents <= 0) return { store: next, rec: null };
  migrateNameToCode(next.products, name, code);
  let p = next.products[key];
  const created = !p;
  if (!p) {
    p = next.products[key] = { key, name: name || '', code: code || '', points: [] };
  }
  if (name) p.name = name;
  if (code) p.code = code;
  const last = p.points[p.points.length - 1];
  let rec;
  if (last && last.c === cents) {
    rec = { key, op: 'touch', prevS: last.s, created };
    last.s = Math.max(last.s, now);
  } else {
    p.points.push({ c: cents, t: now, s: now });
    rec = { key, op: 'push', c: cents, t: now, created };
    if (p.points.length > MAX_POINTS) p.points.splice(0, p.points.length - MAX_POINTS);
  }
  return { store: next, rec };
}

// Deshace un registro hecho con recordPrice (si sigue siendo el último).
export function revertRecord(store, rec) {
  const next = clone(store);
  if (!rec) return next;
  const p = next.products[rec.key];
  if (!p) return next;
  const last = p.points[p.points.length - 1];
  if (rec.op === 'push' && last && last.c === rec.c && last.t === rec.t) p.points.pop();
  else if (rec.op === 'touch' && last && Number.isFinite(rec.prevS)) last.s = rec.prevS;
  if (!p.points.length) delete next.products[rec.key];
  return next;
}

export function relativeTime(t, now = Date.now()) {
  const days = Math.round((startOfDay(now) - startOfDay(t)) / DAY);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 7) return `hace ${days} días`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return w === 1 ? 'hace 1 semana' : `hace ${w} semanas`;
  }
  if (days < 365) {
    const mo = Math.floor(days / 30);
    return mo === 1 ? 'hace 1 mes' : `hace ${mo} meses`;
  }
  const y = Math.floor(days / 365);
  return y === 1 ? 'hace 1 año' : `hace ${y} años`;
}

function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function pctChange(from, to) {
  if (!from) return 0;
  return ((to - from) / from) * 100;
}

// Compara un precio con el último guardado del producto.
// kind: 'new' (no lo conocemos) | 'same' | 'up' | 'down'
export function comparePrice(store, { name, code, cents }) {
  const key = productKey({ name, code });
  let p = key && store.products[key];
  if (!p && code) p = store.products[productKey({ name })];
  if (!p || !p.points.length || !cents) return { kind: 'new' };
  const last = p.points[p.points.length - 1];
  if (last.c === cents) return { kind: 'same', prev: last.c, since: last.s };
  return { kind: cents > last.c ? 'up' : 'down', prev: last.c, since: last.s, pct: pctChange(last.c, cents) };
}

export function getProduct(store, key) {
  return store.products[key] || null;
}

export function listProducts(store) {
  return Object.values(store.products).sort((a, b) => lastSeen(b) - lastSeen(a));
}

function lastSeen(p) {
  return p.points.length ? p.points[p.points.length - 1].s : 0;
}

// Último cambio de cada producto (entre sus dos últimos precios).
export function lastChange(p) {
  const n = p.points.length;
  if (n < 2) return { kind: 'none' };
  const a = p.points[n - 2].c;
  const b = p.points[n - 1].c;
  return { kind: b > a ? 'up' : 'down', pct: pctChange(a, b), from: a, to: b };
}

export function cumulativeChange(p) {
  const n = p.points.length;
  if (n < 2) return null;
  return { from: p.points[0].c, to: p.points[n - 1].c, pct: pctChange(p.points[0].c, p.points[n - 1].c) };
}

export function summary(store) {
  let up = 0;
  let down = 0;
  let unchanged = 0;
  for (const p of Object.values(store.products)) {
    const ch = lastChange(p);
    if (ch.kind === 'up') up++;
    else if (ch.kind === 'down') down++;
    else unchanged++;
  }
  return { total: up + down + unchanged, up, down, unchanged };
}

export function deletePoint(store, key, index) {
  const next = clone(store);
  const p = next.products[key];
  if (!p || index < 0 || index >= p.points.length) return next;
  p.points.splice(index, 1);
  if (!p.points.length) delete next.products[key];
  return next;
}

export function deleteProduct(store, key) {
  const next = clone(store);
  delete next.products[key];
  return next;
}

export function findByCode(store, code) {
  return (code && store.products[productKey({ code })]) || null;
}

// Producto que más subió entre [start, end): compara el precio anterior al período con el último del período.
export function topRiser(store, start, end) {
  let best = null;
  for (const p of Object.values(store.products)) {
    const first = p.points.findIndex((pt) => pt.t >= start && pt.t < end);
    if (first < 1) continue;
    let last = first;
    while (last + 1 < p.points.length && p.points[last + 1].t < end) last++;
    const from = p.points[first - 1].c;
    const to = p.points[last].c;
    const pct = pctChange(from, to);
    if (pct > 0 && (!best || pct > best.pct)) best = { name: p.name, code: p.code, from, to, pct };
  }
  return best;
}
