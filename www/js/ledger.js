// Registro de gastos: compras terminadas, cierres mensuales e historial anual.
// Módulo puro (sin DOM ni storage), se prueba en Node.
//
// ledger = {
//   v: 1,
//   purchases: [{ id, day: 'AAAA-MM-DD', start, end, placeName, category, items: [{ name, code, cents, qty }], total, auto }],
//   closes: [{ month: 'AAAA-MM', closedAt, total, count, seen }],
// }

// La categoría es texto libre; estas aparecen de entrada y después se suman las que escribas.
export const DEFAULT_CATEGORIES = ['Supermercado', 'Almacén', 'Carnicería', 'Verdulería', 'Kiosco', 'Farmacia'];
// Tipos fijos de versiones anteriores
const LEGACY_PLACE = { super: 'Supermercado', mini: 'Almacén', kiosco: 'Kiosco', verduleria: 'Verdulería', otro: 'Otro' };
export const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Si entre dos artículos pasan más de 2 horas, se toman como compras distintas.
export const TRIP_GAP = 2 * 3600_000;

export function emptyLedger() {
  return { v: 1, purchases: [], closes: [] };
}

const pad = (n) => String(n).padStart(2, '0');
export function dayKey(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function monthKey(t) {
  return dayKey(t).slice(0, 7);
}
export function monthLabel(mk) {
  const [y, m] = mk.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
export function prevMonthKey(mk) {
  let [y, m] = mk.split('-').map(Number);
  m--;
  if (!m) {
    m = 12;
    y--;
  }
  return `${y}-${pad(m)}`;
}

const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isMonth = (s) => typeof s === 'string' && /^\d{4}-\d{2}$/.test(s);

export function sanitizeLedger(raw) {
  const out = emptyLedger();
  if (!raw || typeof raw !== 'object') return out;
  if (Array.isArray(raw.purchases)) {
    for (const p of raw.purchases) {
      if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !isDay(p.day) || !Array.isArray(p.items)) continue;
      const items = p.items
        .filter((it) => it && Number.isSafeInteger(it.cents) && it.cents >= 0 && Number.isSafeInteger(it.qty) && it.qty > 0)
        .map((it) => ({ name: typeof it.name === 'string' ? it.name : '', code: typeof it.code === 'string' ? it.code : '', cents: it.cents, qty: it.qty }));
      if (!items.length) continue;
      out.purchases.push({
        id: p.id,
        day: p.day,
        start: Number.isFinite(p.start) ? p.start : 0,
        end: Number.isFinite(p.end) ? p.end : 0,
        placeName: cleanPlaceName(p.placeName),
        category: cleanCategory(p.category) || LEGACY_PLACE[p.place] || '',
        items,
        total: items.reduce((s, it) => s + it.cents * it.qty, 0),
        auto: !!p.auto,
      });
    }
  }
  if (Array.isArray(raw.closes)) {
    for (const c of raw.closes) {
      if (!c || !isMonth(c.month) || out.closes.some((x) => x.month === c.month)) continue;
      out.closes.push({
        month: c.month,
        closedAt: Number.isFinite(c.closedAt) ? c.closedAt : 0,
        total: Number.isSafeInteger(c.total) ? c.total : 0,
        count: Number.isSafeInteger(c.count) ? c.count : 0,
        seen: !!c.seen,
      });
    }
  }
  sortPurchases(out.purchases);
  return out;
}

export function cleanPlaceName(name) {
  return typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
}

export function cleanCategory(name) {
  const s = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  return s && s[0].toUpperCase() + s.slice(1);
}

function sortPurchases(ps) {
  ps.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.start - a.start));
}

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

let seq = 0;
function pid(t) {
  seq = (seq + 1) % 1e6;
  return `p${t.toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

// Agrupa artículos de la lista en compras: por día de alta y separando si pasan más de TRIP_GAP.
export function groupTrips(items, now = Date.now()) {
  const sorted = items.map((it) => ({ it, t: Number.isFinite(it.addedAt) && it.addedAt > 0 ? it.addedAt : now })).sort((a, b) => a.t - b.t);
  const groups = [];
  for (const x of sorted) {
    const g = groups[groups.length - 1];
    if (g && dayKey(g.end) === dayKey(x.t) && x.t - g.end <= TRIP_GAP) {
      g.items.push(x.it);
      g.end = x.t;
    } else {
      groups.push({ day: dayKey(x.t), start: x.t, end: x.t, items: [x.it] });
    }
  }
  return groups;
}

// Guarda artículos como compras; lugar y categoría se aplican a todas. Con day (otra fecha elegida a mano)
// todo va a una sola compra de ese día, con la hora en que se agregaron los artículos.
export function archiveItems(ledger, items, { placeName = '', category = '', day = '', now = Date.now(), auto = false } = {}) {
  const next = clone(ledger);
  const created = [];
  let groups = groupTrips(items, now);
  if (isRealDay(day) && groups.length) {
    const all = { day, start: moveToDay(groups[0].start, day), end: moveToDay(groups[groups.length - 1].end, day), items: groups.flatMap((g) => g.items) };
    groups = [all];
  }
  for (const g of groups) {
    const its = g.items.map((it) => ({ name: it.name || '', code: it.code || '', cents: it.cents, qty: it.qty }));
    const p = { id: pid(now), day: g.day, start: g.start, end: g.end, placeName: cleanPlaceName(placeName), category: cleanCategory(category), items: its, total: its.reduce((s, it) => s + it.cents * it.qty, 0), auto };
    next.purchases.push(p);
    created.push(p.id);
  }
  sortPurchases(next.purchases);
  return { ledger: next, created };
}

// Artículos de días anteriores a hoy: una compra no dura varios días, así que se guardan solos.
export function staleItems(items, now = Date.now()) {
  const today = dayKey(now);
  return items.filter((it) => Number.isFinite(it.addedAt) && it.addedAt > 0 && dayKey(it.addedAt) < today);
}

export function monthTotals(ledger, mk) {
  const ps = ledger.purchases.filter((p) => p.day.startsWith(mk));
  return { month: mk, total: ps.reduce((s, p) => s + p.total, 0), count: ps.length, purchases: ps };
}

// Cierra los meses anteriores al actual que tengan compras y no estén cerrados.
export function closeMonths(ledger, now = Date.now()) {
  const current = monthKey(now);
  const next = clone(ledger);
  const months = [...new Set(next.purchases.map((p) => p.day.slice(0, 7)))].filter((m) => m < current).sort();
  const closed = [];
  for (const m of months) {
    if (next.closes.some((c) => c.month === m)) continue;
    const t = monthTotals(next, m);
    next.closes.push({ month: m, closedAt: now, total: t.total, count: t.count, seen: false });
    closed.push(m);
  }
  next.closes.sort((a, b) => (a.month < b.month ? -1 : 1));
  return { ledger: next, closed };
}

export function isClosed(ledger, mk) {
  return ledger.closes.some((c) => c.month === mk);
}

// Ver un cierre da por vistos también los anteriores (no tiene sentido mostrarlos uno por uno después).
export function markCloseSeen(ledger, mk) {
  const next = clone(ledger);
  for (const c of next.closes) if (c.month <= mk) c.seen = true;
  return next;
}

// Resumen de un cierre: total actual del mes (puede cambiar si se borra una compra) y comparación.
export function closeSummary(ledger, mk) {
  const cur = monthTotals(ledger, mk);
  const prev = monthTotals(ledger, prevMonthKey(mk));
  const byCategory = {};
  for (const p of cur.purchases) byCategory[p.category || ''] = (byCategory[p.category || ''] || 0) + p.total;
  return {
    month: mk,
    total: cur.total,
    count: cur.count,
    prevTotal: prev.count ? prev.total : null,
    pct: prev.count && prev.total ? ((cur.total - prev.total) / prev.total) * 100 : null,
    byCategory,
  };
}

// Historial anual: 12 meses con total y cantidad de compras. extra = { month, cents } de la compra en curso.
export function yearSummary(ledger, year, extra = null) {
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const mk = `${year}-${pad(m)}`;
    const t = monthTotals(ledger, mk);
    const inProgress = extra && extra.month === mk ? extra.cents : 0;
    months.push({ month: mk, total: t.total, count: t.count, inProgress, closed: isClosed(ledger, mk) });
  }
  const withData = months.filter((m) => m.count > 0);
  const total = months.reduce((s, m) => s + m.total, 0);
  return {
    year,
    months,
    total,
    count: months.reduce((s, m) => s + m.count, 0),
    average: withData.length ? Math.round(total / withData.length) : 0,
    monthsWithData: withData.length,
  };
}

export function years(ledger, now = Date.now()) {
  const ys = new Set(ledger.purchases.map((p) => Number(p.day.slice(0, 4))));
  ys.add(new Date(now).getFullYear());
  return [...ys].sort((a, b) => a - b);
}

export function deletePurchase(ledger, id) {
  const next = clone(ledger);
  next.purchases = next.purchases.filter((p) => p.id !== id);
  return next;
}

function retotal(p) {
  p.total = p.items.reduce((s, it) => s + it.cents * it.qty, 0);
}

function isRealDay(day) {
  if (!isDay(day)) return false;
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d)) === day;
}

function moveToDay(t, day) {
  if (!t) return t;
  const [y, m, d] = day.split('-').map(Number);
  const x = new Date(t);
  x.setFullYear(y, m - 1, d);
  return x.getTime();
}

// Cambia el día de una compra conservando la hora (para corregir o cargar una compra de otro día).
export function setPurchaseDay(ledger, id, day) {
  const next = clone(ledger);
  const p = next.purchases.find((x) => x.id === id);
  if (!p || !isRealDay(day) || p.day === day) return next;
  p.start = moveToDay(p.start, day);
  p.end = moveToDay(p.end, day);
  p.day = day;
  sortPurchases(next.purchases);
  return next;
}

export function setPurchaseItem(ledger, id, index, { cents, qty }) {
  const next = clone(ledger);
  const p = next.purchases.find((x) => x.id === id);
  const it = p?.items[index];
  if (!it) return next;
  if (Number.isSafeInteger(cents) && cents > 0) it.cents = cents;
  if (Number.isSafeInteger(qty) && qty > 0) it.qty = Math.min(qty, 9999);
  retotal(p);
  return next;
}

export function addPurchaseItem(ledger, id, { name = '', cents, qty = 1 }) {
  const next = clone(ledger);
  const p = next.purchases.find((x) => x.id === id);
  if (!p || !Number.isSafeInteger(cents) || cents <= 0) return next;
  p.items.push({ name: String(name).replace(/\s+/g, ' ').trim().slice(0, 120), code: '', cents, qty: Math.min(Math.max(1, qty | 0), 9999) });
  retotal(p);
  return next;
}

// Una compra conserva al menos un artículo: para quitarla entera está deletePurchase.
export function removePurchaseItem(ledger, id, index) {
  const next = clone(ledger);
  const p = next.purchases.find((x) => x.id === id);
  if (!p || p.items.length < 2 || !p.items[index]) return next;
  p.items.splice(index, 1);
  retotal(p);
  return next;
}

// Compras del mes agrupadas por día (más reciente primero), con el total de cada día.
export function monthDays(ledger, mk) {
  const days = [];
  for (const p of monthTotals(ledger, mk).purchases) {
    let d = days[days.length - 1];
    if (!d || d.day !== p.day) days.push((d = { day: p.day, total: 0, purchases: [] }));
    d.total += p.total;
    d.purchases.push(p);
  }
  return days;
}

export function setCategory(ledger, id, category) {
  const next = clone(ledger);
  const p = next.purchases.find((x) => x.id === id);
  if (p) p.category = cleanCategory(category);
  return next;
}

export function setPlaceName(ledger, id, name) {
  const next = clone(ledger);
  const p = next.purchases.find((x) => x.id === id);
  if (p) p.placeName = cleanPlaceName(name);
  return next;
}

// Lugares usados antes (para elegirlos con un toque y recordar su categoría). Más usados primero.
export function knownPlaces(ledger) {
  const map = new Map();
  for (const p of ledger.purchases) {
    if (!p.placeName) continue;
    const k = p.placeName.toLowerCase();
    const cur = map.get(k) || { name: p.placeName, category: '', count: 0, last: '' };
    cur.count++;
    if (p.day >= cur.last) {
      cur.last = p.day;
      cur.name = p.placeName;
      if (p.category) cur.category = p.category;
    }
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1));
}

// Categorías para elegir: las que más usás primero, después las de entrada que falten.
export function knownCategories(ledger, extra = []) {
  const count = new Map();
  for (const p of ledger.purchases) {
    if (!p.category) continue;
    const k = p.category.toLowerCase();
    const cur = count.get(k) || { name: p.category, n: 0 };
    cur.n++;
    count.set(k, cur);
  }
  const out = [...count.values()].sort((a, b) => b.n - a.n).map((c) => c.name);
  for (const c of [...extra, ...DEFAULT_CATEGORIES]) {
    const v = cleanCategory(c);
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  }
  return out;
}

// Gasto del mes por lugar escrito (o por tipo si no se escribió el lugar), de mayor a menor.
export function placeBreakdown(ledger, mk) {
  const map = new Map();
  for (const p of monthTotals(ledger, mk).purchases) {
    const name = p.placeName || p.category || 'Sin especificar';
    const k = name.toLowerCase();
    const cur = map.get(k) || { name, total: 0, count: 0 };
    cur.total += p.total;
    cur.count++;
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function categoryFor(ledger, placeName) {
  const k = cleanPlaceName(placeName).toLowerCase();
  if (!k) return '';
  return knownPlaces(ledger).find((x) => x.name.toLowerCase() === k)?.category || '';
}

// CSV del mes para importar en otra app de gastos.
// Una fila por compra: Fecha (AAAA-MM-DD), Hora, Lugar, Categoría, Monto (punto decimal),
// Moneda, Artículos, Detalle. Separador coma, UTF-8 con BOM (para que Excel respete los acentos).
export const CSV_HEADER = ['Fecha', 'Hora', 'Lugar', 'Categoría', 'Monto', 'Moneda', 'Artículos', 'Detalle'];

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function monthCSV(ledger, mk) {
  const rows = monthTotals(ledger, mk)
    .purchases.slice()
    .sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.start - b.start));
  const lines = [CSV_HEADER.map(csvCell).join(',')];
  for (const p of rows) {
    const d = p.start ? new Date(p.start) : null;
    const hora = d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
    const detalle = p.items.map((it) => `${it.name || 'Artículo'} x${it.qty}`).join('; ');
    const monto = `${Math.floor(p.total / 100)}.${pad(p.total % 100)}`;
    lines.push(
      [p.day, hora, p.placeName || '', p.category || 'Sin especificar', monto, 'ARS', p.items.reduce((s, it) => s + it.qty, 0), detalle]
        .map(csvCell)
        .join(','),
    );
  }
  return `\ufeff${lines.join('\r\n')}\r\n`;
}
