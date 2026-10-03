// Lógica pura de la lista de compras.
import { normalizeName } from './history.js';

export function emptyList() {
  return { items: [], limit: null };
}

let seq = 0;
export function newId() {
  seq = (seq + 1) % 1e6;
  return `${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function validItem(it) {
  return (
    it &&
    typeof it === 'object' &&
    typeof it.id === 'string' &&
    Number.isSafeInteger(it.cents) &&
    it.cents >= 0 &&
    Number.isSafeInteger(it.qty) &&
    it.qty > 0
  );
}

export function sanitizeList(raw) {
  const list = emptyList();
  if (!raw || typeof raw !== 'object') return list;
  if (Array.isArray(raw.items)) {
    for (const it of raw.items) {
      if (!validItem(it)) continue;
      list.items.push({
        id: it.id,
        name: typeof it.name === 'string' ? it.name.slice(0, 120) : '',
        code: typeof it.code === 'string' && /^\d{8,14}$/.test(it.code) ? it.code : '',
        cents: it.cents,
        qty: Math.min(it.qty, 9999),
        pending: Array.isArray(it.pending) && it.pending.length ? it.pending.filter((x) => typeof x === 'string') : null,
        cmp: it.cmp && typeof it.cmp === 'object' && typeof it.cmp.kind === 'string' ? it.cmp : null,
        rec: it.rec && typeof it.rec === 'object' && typeof it.rec.key === 'string' ? it.rec : null,
        addedAt: Number.isFinite(it.addedAt) ? it.addedAt : 0,
      });
    }
  }
  if (Number.isSafeInteger(raw.limit) && raw.limit > 0) list.limit = raw.limit;
  return list;
}

export function totals(list) {
  let cents = 0;
  let units = 0;
  for (const it of list.items) {
    cents += it.cents * it.qty;
    units += it.qty;
  }
  return { cents, units, count: list.items.length };
}

// ¿Es "el mismo" artículo? Mismo código, o mismo nombre (normalizado); y mismo precio.
export function findSame(list, { name, code, cents }, exceptId = null) {
  const n = normalizeName(name);
  return (
    list.items.find((it) => {
      if (it.id === exceptId || it.cents !== cents) return false;
      if (code && it.code) return it.code === code;
      if (code && !it.code && !n) return false;
      return !!n && normalizeName(it.name) === n;
    }) || null
  );
}

export function limitState(list) {
  const { cents } = totals(list);
  if (!list.limit) return null;
  const diff = list.limit - cents;
  return { limit: list.limit, total: cents, over: diff < 0, remaining: Math.max(diff, 0), excess: Math.max(-diff, 0) };
}
