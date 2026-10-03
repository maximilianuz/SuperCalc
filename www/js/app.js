import { formatMoney, parseMoneyInput, centsToInput, formatPercent } from './money.js';
import { loadJSON, saveJSON } from './storage.js';
import { emptyList, sanitizeList, totals, findSame, limitState, newId } from './list.js';
import {
  emptyStore,
  sanitizeStore,
  recordPrice,
  revertRecord,
  comparePrice,
  relativeTime,
  listProducts,
  lastChange,
  cumulativeChange,
  summary,
  deletePoint,
  deleteProduct,
  findByCode,
  normalizeName,
  productKey,
  pctChange,
} from './history.js';

const LIST_KEY = 'compras.lista.v1';
const HIST_KEY = 'compras.historial.v1';

const SHORT_RULE = {
  mayorista: 'mayorista',
  promo: 'promo',
  cuotas: 'cuotas',
  medida: 'por medida',
  sinImpuestos: 'sin impuestos',
  anterior: 'precio anterior',
};
const LONG_RULE = {
  mayorista: 'un precio mayorista o por cantidad',
  promo: 'un precio de promoción u oferta',
  cuotas: 'un precio en cuotas',
  medida: 'un precio por unidad de medida (kg, litro…)',
  sinImpuestos: 'un precio sin impuestos nacionales',
  anterior: 'un precio anterior',
};

// ---------- Estado ----------
let list = loadJSON(LIST_KEY, sanitizeList, emptyList);
let hist = loadJSON(HIST_KEY, sanitizeStore, emptyStore);
let wasOver = !!limitState(list)?.over;

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// Fechas con formato propio (Intl varía entre versiones de WebView)
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const fmtShortDate = (t) => {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
const fmtDate = (t) => `${fmtShortDate(t)} ${new Date(t).getFullYear()}`;
// Período en que se vio un precio: «5 jun 2026», «5–9 jun 2026», «28 may → 3 jun 2026»
function fmtRange(a, b) {
  const da = new Date(a);
  const db = new Date(b);
  if (fmtDate(a) === fmtDate(b)) return fmtDate(a);
  if (da.getFullYear() !== db.getFullYear()) return `${fmtDate(a)} → ${fmtDate(b)}`;
  if (da.getMonth() === db.getMonth()) return `${da.getDate()}–${fmtDate(b)}`;
  return `${fmtShortDate(a)} → ${fmtDate(b)}`;
}

const el = {
  card: $('#total-card'),
  amount: $('#total-amount'),
  meta: $('#total-meta'),
  limitBox: $('#limit-box'),
  limitFill: $('#limit-fill'),
  limitMark: $('#limit-mark'),
  limitText: $('#limit-text'),
  limitOf: $('#limit-of'),
  list: $('#list'),
  listHead: $('#list-head'),
  empty: $('#empty'),
  filePhoto: $('#file-photo'),
  fileCode: $('#file-code'),
  sheetItem: $('#sheet-item'),
  itemForm: $('#item-form'),
  itemTitle: $('#item-title'),
  busy: $('#item-busy'),
  busyText: $('#item-busy-text'),
  scanMsg: $('#scan-msg'),
  scanBox: $('#scan-box'),
  cands: $('#cands'),
  scanWarn: $('#scan-warn'),
  name: $('#f-name'),
  names: $('#known-names'),
  price: $('#f-price'),
  priceErr: $('#price-err'),
  trend: $('#f-trend'),
  pending: $('#f-pending'),
  pendingText: $('#f-pending-text'),
  codeLine: $('#f-code-line'),
  code: $('#f-code'),
  qty: $('#f-qty'),
  save: $('#btn-item-save'),
  remove: $('#btn-item-remove'),
  sheetLimit: $('#sheet-limit'),
  limitInput: $('#f-limit'),
  limitErr: $('#limit-err'),
  confirm: $('#dlg-confirm'),
  sheetHistory: $('#sheet-history'),
  histBody: $('#hist-body'),
  histBack: $('#hist-back'),
  histTitle: $('#history-title'),
  toastHost: $('#toast-host'),
};

function saveList() {
  saveJSON(LIST_KEY, list);
}
function saveHist() {
  saveJSON(HIST_KEY, hist);
}

// ---------- Diálogos (con soporte del botón Atrás de Android) ----------
// Mientras haya un diálogo abierto hay UNA entrada extra en el historial: «Atrás» cierra el
// diálogo de arriba en vez de salir de la app. backPending evita carreras al cerrar y abrir rápido.
const dialogStack = [];
let backPending = false;
const modalState = () => history.state && history.state.comprasModal;
// close() cambia .open al instante pero el evento «close» llega después: contamos por .open
const openDialogs = () => dialogStack.filter((d) => d.open);

// history.state sobrevive a una recarga: si quedó la marca modal sin diálogos abiertos, la limpiamos
// (si no, el próximo history.back() cruzaría al documento anterior y recargaría la app).
if (modalState()) {
  try {
    history.replaceState(null, '');
  } catch {}
}

function pushModalState() {
  try {
    history.pushState({ comprasModal: true }, '');
  } catch {}
}

function openDialog(d) {
  if (d.open) return;
  d.showModal();
  if (!dialogStack.includes(d)) dialogStack.push(d);
  if (!backPending && !modalState()) pushModalState();
}

for (const d of document.querySelectorAll('dialog')) {
  d.addEventListener('close', () => {
    const i = dialogStack.indexOf(d);
    if (i >= 0 && !d.open) dialogStack.splice(i, 1);
    const fromPop = d.__fromPop;
    d.__fromPop = false;
    if (!fromPop && !openDialogs().length && modalState() && !backPending) {
      backPending = true;
      history.back();
    }
  });
  // Tocar el fondo cierra
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close('cancel');
  });
  for (const b of d.querySelectorAll('[data-close]')) b.addEventListener('click', () => d.close('cancel'));
}

window.addEventListener('popstate', () => {
  if (backPending) {
    backPending = false;
    if (openDialogs().length && !modalState()) pushModalState();
    return;
  }
  const top = openDialogs().pop();
  if (top) {
    top.__fromPop = true;
    top.close('cancel');
    if (openDialogs().length) pushModalState();
  }
});

function confirmDialog({ title, text, ok = 'Aceptar' }) {
  return new Promise((resolve) => {
    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent = text;
    $('#confirm-ok').textContent = ok;
    el.confirm.returnValue = '';
    el.confirm.addEventListener('close', () => resolve(el.confirm.returnValue === 'ok'), { once: true });
    openDialog(el.confirm);
    $('#confirm-cancel').focus();
  });
}

// ---------- Avisos (toast). Con un diálogo abierto, se muestran adentro del diálogo ----------
function toastHost() {
  // El evento close llega después: filtramos por .open para no meter el aviso en una hoja recién cerrada.
  const top = openDialogs().pop();
  if (!top) return el.toastHost;
  let host = top.querySelector(':scope > .toast-host');
  if (!host) {
    host = document.createElement('div');
    host.className = 'toast-host';
    host.setAttribute('aria-live', 'polite');
    top.appendChild(host);
  }
  return host;
}

function toast(msg, { action, onAction, tone, duration } = {}) {
  const host = toastHost();
  const t = document.createElement('div');
  t.className = `toast${tone ? ` ${tone}` : ''}`;
  t.setAttribute('role', 'status');
  const m = document.createElement('span');
  m.className = 'toast-msg';
  m.textContent = msg;
  t.appendChild(m);
  let timer;
  const leave = () => {
    clearTimeout(timer);
    t.inert = true;
    t.classList.add('leaving');
    setTimeout(() => t.remove(), 180);
  };
  if (action) {
    // Un solo «Deshacer» vivo: deshacer algo viejo pisaría cambios más nuevos.
    for (const old of document.querySelectorAll('.toast.has-action')) old.remove();
    t.classList.add('has-action');
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = action;
    b.addEventListener('click', () => {
      leave();
      onAction?.();
    });
    t.appendChild(b);
  }
  // Como mucho dos avisos a la vez
  while (host.children.length >= 2) host.firstElementChild.remove();
  host.appendChild(t);
  timer = setTimeout(leave, duration ?? (action ? 6000 : 3200));
  return t;
}

// ---------- Render de la lista ----------
function render() {
  const t = totals(list);
  el.amount.textContent = formatMoney(t.cents);
  el.meta.textContent = t.count ? `${plural(t.count, 'artículo', 'artículos')} · ${plural(t.units, 'unidad', 'unidades')}` : 'Sin artículos';

  const ls = limitState(list);
  el.limitBox.hidden = !ls;
  el.card.classList.toggle('over', !!ls?.over);
  if (ls) {
    const scale = Math.max(ls.limit, ls.total) || 1;
    el.limitFill.style.width = `${Math.min(100, (ls.total / scale) * 100)}%`;
    el.limitMark.style.left = `${(ls.limit / scale) * 100}%`;
    el.limitBox.classList.toggle('near', !ls.over && ls.total >= ls.limit * 0.9);
    el.limitText.textContent = ls.over ? `Te pasaste por ${formatMoney(ls.excess)}` : `Te quedan ${formatMoney(ls.remaining)}`;
    el.limitOf.textContent = `Límite ${formatMoney(ls.limit)}`;
  }

  el.empty.hidden = list.items.length > 0;
  el.listHead.hidden = list.items.length === 0;
  el.list.innerHTML = list.items.map(itemHTML).join('');
}

function trendTag(cmp) {
  if (!cmp || (cmp.kind !== 'up' && cmp.kind !== 'down')) return '';
  const arrow = cmp.kind === 'up' ? '▲' : '▼';
  return `<span class="tag ${cmp.kind}" title="${cmp.kind === 'up' ? 'Subió' : 'Bajó'} desde ${esc(formatMoney(cmp.prev))}">${arrow} ${esc(formatPercent(cmp.pct))}</span>`;
}

function itemHTML(it) {
  const name = it.name ? esc(it.name) : 'Artículo sin nombre';
  const pend = it.pending ? '<span class="tag warn">A confirmar</span>' : '';
  return `<li class="item" data-id="${esc(it.id)}">
    <button type="button" class="item-main" data-act="edit" aria-label="Editar ${name}">
      <div class="item-name${it.name ? '' : ' unnamed'}">${name}</div>
      <div class="item-sub"><span>${esc(formatMoney(it.cents))} c/u</span>${trendTag(it.cmp)}${pend}</div>
    </button>
    <div class="item-side">
      <span class="item-total">${esc(formatMoney(it.cents * it.qty))}</span>
      <div class="stepper">
        <button type="button" class="step" data-act="minus" aria-label="Restar uno">−</button>
        <output>${it.qty}</output>
        <button type="button" class="step" data-act="plus" aria-label="Sumar uno">+</button>
      </div>
    </div>
  </li>`;
}

function commit() {
  saveList();
  render();
  const ls = limitState(list);
  const over = !!ls?.over;
  if (over && !wasOver) alertOver(ls);
  wasOver = over;
}

function alertOver(ls) {
  try {
    navigator.vibrate?.([120, 80, 120]);
  } catch {}
  toast(`Superaste el límite: te pasaste por ${formatMoney(ls.excess)}`, { tone: 'bad', duration: 4500 });
}

el.list.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const li = btn.closest('.item');
  const it = list.items.find((x) => x.id === li?.dataset.id);
  if (!it) return;
  const act = btn.dataset.act;
  if (act === 'edit') openItemSheet({ mode: 'edit', item: it });
  else if (act === 'plus') {
    it.qty = Math.min(it.qty + 1, 9999);
    commit();
  } else if (act === 'minus') {
    if (it.qty > 1) {
      it.qty--;
      commit();
    } else removeItem(it.id);
  }
});

function removeItem(id) {
  const idx = list.items.findIndex((x) => x.id === id);
  if (idx < 0) return;
  const [removed] = list.items.splice(idx, 1);
  commit();
  toast(`Quitaste «${removed.name || 'Artículo sin nombre'}»`, {
    action: 'Deshacer',
    onAction: () => {
      list.items.splice(Math.min(idx, list.items.length), 0, removed);
      commit();
    },
  });
}

$('#btn-clear').addEventListener('click', async () => {
  const n = list.items.length;
  if (!n) return;
  const ok = await confirmDialog({
    title: '¿Vaciar la lista?',
    text: `Se van a quitar ${plural(n, 'artículo', 'artículos')}. El historial de precios se mantiene.`,
    ok: 'Vaciar',
  });
  if (!ok) return;
  const backup = list.items;
  list.items = [];
  commit();
  toast('Vaciaste la lista', {
    action: 'Deshacer',
    onAction: () => {
      list.items = backup.concat(list.items);
      commit();
    },
  });
});

// Total fijo: se marca cuando queda pegado arriba
const onScroll = () => el.card.classList.toggle('stuck', el.card.getBoundingClientRect().top <= 0.5 && window.scrollY > 0);
window.addEventListener('scroll', onScroll, { passive: true });

// ---------- Límite ----------
$('#btn-limit').addEventListener('click', () => {
  el.limitInput.value = list.limit ? centsToInput(list.limit) : '';
  el.limitErr.hidden = true;
  $('#btn-limit-remove').hidden = !list.limit;
  openDialog(el.sheetLimit);
});

$('#limit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const cents = parseMoneyInput(el.limitInput.value);
  if (!cents) {
    el.limitErr.hidden = false;
    return;
  }
  list.limit = cents;
  el.sheetLimit.close();
  commit();
});

$('#btn-limit-remove').addEventListener('click', () => {
  list.limit = null;
  el.sheetLimit.close();
  commit();
});

// ---------- Hoja de artículo ----------
let draft = null;
let scanSeq = 0;

function baseHist() {
  // Al editar, comparamos sin el registro que generó este mismo artículo.
  const it = draft?.mode === 'edit' && list.items.find((x) => x.id === draft.id);
  return it && it.rec ? revertRecord(hist, it.rec) : hist;
}

function openItemSheet({ mode, item }) {
  scanSeq++;
  draft = {
    mode,
    id: item?.id || null,
    code: item?.code || '',
    qty: item?.qty || 1,
    pending: item?.pending ? [...item.pending] : null,
    picked: item?.pending ? item.cents : null,
  };
  el.itemTitle.textContent = mode === 'edit' ? 'Editar artículo' : 'Agregar artículo';
  el.name.value = item?.name || '';
  el.price.value = item ? centsToInput(item.cents) : '';
  el.remove.hidden = mode !== 'edit';
  el.busy.hidden = true;
  el.scanMsg.hidden = true;
  el.scanBox.hidden = true;
  el.priceErr.hidden = true;
  el.price.closest('.field').classList.remove('invalid');
  el.names.innerHTML = listProducts(hist)
    .filter((p) => p.name)
    .slice(0, 200)
    .map((p) => `<option value="${esc(p.name)}"></option>`)
    .join('');
  syncDraftUI();
  if (!el.sheetItem.open) openDialog(el.sheetItem);
}

function syncDraftUI() {
  el.qty.textContent = draft.qty;
  el.codeLine.hidden = !draft.code;
  el.code.textContent = draft.code;
  el.pending.hidden = !draft.pending;
  if (draft.pending) {
    el.pendingText.textContent = `Parece ${draft.pending.map((id) => LONG_RULE[id] || id).join(' y ')}. No se guarda en el historial hasta que confirmes que es el precio final.`;
  }
  updateTrend();
  updateSaveLabel();
}

function updateSaveLabel() {
  const cents = parseMoneyInput(el.price.value);
  const verb = draft.mode === 'edit' ? 'Guardar' : 'Agregar';
  el.save.textContent = cents ? `${verb} · ${formatMoney(cents * draft.qty)}` : verb;
}

function trendHTML(cmp) {
  if (cmp.kind === 'up' || cmp.kind === 'down') {
    const word = cmp.kind === 'up' ? '▲ Subió' : '▼ Bajó';
    return `${word} ${esc(formatPercent(cmp.pct))} desde ${esc(formatMoney(cmp.prev))} <small>(${esc(relativeTime(cmp.since))})</small>`;
  }
  if (cmp.kind === 'same') return `Igual que la última vez <small>(${esc(relativeTime(cmp.since))})</small>`;
  return '';
}

function updateTrend() {
  const name = el.name.value.trim();
  const code = draft.code;
  const cents = parseMoneyInput(el.price.value);
  const base = baseHist();
  let html = '';
  let cls = 'info';
  if (name || code) {
    if (cents && draft.pending) {
      const cmp = comparePrice(base, { name, code, cents });
      if (cmp.kind !== 'new') html = `Último precio guardado: ${esc(formatMoney(cmp.prev))} <small>(${esc(relativeTime(cmp.since))})</small>`;
    } else if (cents) {
      const cmp = comparePrice(base, { name, code, cents });
      html = trendHTML(cmp);
      cls = cmp.kind;
    } else {
      const cmp = comparePrice(base, { name, code, cents: -1 });
      if (cmp.kind !== 'new') html = `Último precio: ${esc(formatMoney(cmp.prev))} <small>(${esc(relativeTime(cmp.since))})</small>`;
    }
  }
  el.trend.className = `trend ${cls}`;
  el.trend.innerHTML = html;
  el.trend.hidden = !html;
}

el.name.addEventListener('input', updateTrend);
el.price.addEventListener('input', () => {
  const cents = parseMoneyInput(el.price.value);
  el.priceErr.hidden = true;
  el.price.closest('.field').classList.remove('invalid');
  // Si la persona cambia a mano el precio elegido de la foto, deja de estar "a confirmar".
  if (draft.pending && cents !== draft.picked) {
    draft.pending = null;
    draft.picked = null;
    for (const c of el.cands.querySelectorAll('.chip.selected')) c.classList.remove('selected');
    syncDraftUI();
    return;
  }
  updateTrend();
  updateSaveLabel();
});

$('#f-minus').addEventListener('click', () => {
  draft.qty = Math.max(1, draft.qty - 1);
  syncDraftUI();
});
$('#f-plus').addEventListener('click', () => {
  draft.qty = Math.min(9999, draft.qty + 1);
  syncDraftUI();
});
$('#btn-code-clear').addEventListener('click', () => {
  draft.code = '';
  syncDraftUI();
});
$('#btn-confirm-price').addEventListener('click', () => {
  draft.pending = null;
  syncDraftUI();
});
el.remove.addEventListener('click', () => {
  const id = draft.id;
  el.sheetItem.close();
  removeItem(id);
});

el.itemForm.addEventListener('submit', (e) => {
  e.preventDefault();
  saveDraft();
});

function saveDraft() {
  const cents = parseMoneyInput(el.price.value);
  if (!cents) {
    el.priceErr.hidden = false;
    el.price.closest('.field').classList.add('invalid');
    el.price.focus();
    return;
  }
  const name = el.name.value.trim().replace(/\s+/g, ' ');
  const code = draft.code || '';
  const qty = draft.qty;
  const pending = draft.pending && draft.pending.length ? [...draft.pending] : null;
  const now = Date.now();

  const record = (base) => {
    if (pending || !productKey({ name, code })) return { base, cmp: null, rec: null };
    const cmp = comparePrice(base, { name, code, cents });
    const r = recordPrice(base, { name, code, cents, now });
    return { base: r.store, cmp, rec: r.rec };
  };

  if (draft.mode === 'edit') {
    const it = list.items.find((x) => x.id === draft.id);
    if (!it) return el.sheetItem.close();
    const changed =
      it.cents !== cents || normalizeName(it.name) !== normalizeName(name) || it.code !== code || !!it.pending !== !!pending;
    if (changed) {
      const r = record(it.rec ? revertRecord(hist, it.rec) : hist);
      hist = r.base;
      it.cmp = r.cmp;
      it.rec = r.rec;
    }
    Object.assign(it, { name, code, cents, qty, pending });
    saveHist();
    el.sheetItem.close();
    commit();
    return;
  }

  const same = findSame(list, { name, code, cents });
  if (same) {
    same.qty = Math.min(9999, same.qty + qty);
    if (code && !same.code) same.code = code;
    if (!same.name && name) same.name = name;
    if (same.pending && !pending) {
      same.pending = null;
      const r = record(hist);
      hist = r.base;
      same.cmp = r.cmp;
      same.rec = r.rec;
    } else if (!pending) {
      hist = recordPrice(hist, { name: same.name, code: same.code, cents, now }).store;
    }
    saveHist();
    el.sheetItem.close();
    commit();
    toast(`Sumamos ${qty} a «${same.name || 'Artículo sin nombre'}» (ahora ${same.qty})`);
    return;
  }

  const r = record(hist);
  hist = r.base;
  list.items.unshift({ id: newId(), name, code, cents, qty, pending, cmp: r.cmp, rec: r.rec, addedAt: now });
  saveHist();
  el.sheetItem.close();
  commit();
}

// ---------- Foto del precio y código de barras ----------
let photoFromSheet = false;
let codeFromSheet = false;

$('#btn-photo').addEventListener('click', () => {
  photoFromSheet = false;
  el.filePhoto.value = '';
  el.filePhoto.click();
});
$('#btn-item-photo').addEventListener('click', () => {
  photoFromSheet = true;
  el.filePhoto.value = '';
  el.filePhoto.click();
});
$('#btn-code').addEventListener('click', () => {
  codeFromSheet = false;
  el.fileCode.value = '';
  el.fileCode.click();
});
$('#btn-item-code').addEventListener('click', () => {
  codeFromSheet = true;
  el.fileCode.value = '';
  el.fileCode.click();
});
$('#btn-manual').addEventListener('click', () => {
  openItemSheet({ mode: 'add' });
  el.price.focus();
});

el.filePhoto.addEventListener('change', () => {
  const f = el.filePhoto.files?.[0];
  if (f) handlePhoto(f, photoFromSheet && el.sheetItem.open);
});
el.fileCode.addEventListener('change', () => {
  const f = el.fileCode.files?.[0];
  if (f) handleCode(f, codeFromSheet && el.sheetItem.open);
});

function setBusy(text) {
  el.busy.hidden = !text;
  if (text) el.busyText.textContent = text;
  el.save.disabled = !!text;
}

function showMsg(text, tone) {
  el.scanMsg.hidden = !text;
  el.scanMsg.textContent = text || '';
  el.scanMsg.className = `notice${tone ? ` ${tone}` : ''}`;
}

const loadMods = () => Promise.all([import('./imageutil.js'), import('./ocr.js'), import('./barcode.js')]);

function applyCode(code) {
  draft.code = code;
  const p = findByCode(hist, code);
  if (p && p.name && !el.name.value.trim()) el.name.value = p.name;
  syncDraftUI();
  return p;
}

async function handlePhoto(file, keep) {
  if (!keep) openItemSheet({ mode: 'add' });
  const seq = ++scanSeq;
  const alive = () => seq === scanSeq && el.sheetItem.open;
  showMsg('');
  el.scanBox.hidden = true;
  setBusy('Abriendo la foto…');
  try {
    const [{ loadImage }, { readPrice }, { readBarcode }] = await loadMods();
    const img = await loadImage(file);
    if (!alive()) return;
    let code = null;
    if (!draft.code) {
      setBusy('Buscando código de barras…');
      try {
        code = await readBarcode(img);
      } catch {}
      if (!alive()) return;
      if (code) applyCode(code);
    }
    const res = await readPrice(img, (t) => alive() && setBusy(t));
    if (!alive()) return;
    showCandidates(res, code);
  } catch (err) {
    console.error(err);
    if (alive()) showMsg('No pudimos procesar la foto. Escribí el precio a mano.', 'warn');
  } finally {
    if (seq === scanSeq) setBusy(null);
  }
}

function showCandidates(res, code) {
  const cands = res.candidates.slice(0, 8);
  window.__lastScan = res;
  if (!cands.length) {
    showMsg(`No encontramos ningún precio en la foto.${code ? ' Sí leímos el código de barras.' : ''} Escribí el precio a mano.`, 'warn');
    el.price.focus();
    return;
  }
  if (code) showMsg(`También leímos el código de barras ${code}.`);
  el.scanBox.hidden = false;
  el.cands.innerHTML = cands
    .map((c, i) => {
      let note = '';
      if (c.own.length) note = `A confirmar · ${c.own.map((id) => SHORT_RULE[id] || id).join(', ')}`;
      else if (c.suggested) note = 'Sugerido';
      else if (c.flags.includes('dollarAsFive')) note = 'Otra lectura';
      const cls = ['chip', c.suggested ? 'suggested' : '', c.own.length ? 'flagged' : ''].filter(Boolean).join(' ');
      return `<button type="button" class="${cls}" data-i="${i}" data-cents="${c.cents}"><b>${esc(formatMoney(c.cents))}</b>${note ? `<small>${esc(note)}</small>` : ''}</button>`;
    })
    .join('');
  el.scanWarn.innerHTML = res.warnings.map((w) => `<li>${esc(w)}</li>`).join('');
  el.cands.onclick = (e) => {
    const b = e.target.closest('.chip');
    if (!b) return;
    const c = cands[Number(b.dataset.i)];
    for (const x of el.cands.querySelectorAll('.chip')) x.classList.toggle('selected', x === b);
    el.price.value = centsToInput(c.cents);
    el.priceErr.hidden = true;
    el.price.closest('.field').classList.remove('invalid');
    draft.picked = c.cents;
    draft.pending = c.own.length ? [...c.own] : null;
    syncDraftUI();
  };
}

async function handleCode(file, keep) {
  if (!keep) openItemSheet({ mode: 'add' });
  const seq = ++scanSeq;
  const alive = () => seq === scanSeq && el.sheetItem.open;
  showMsg('');
  setBusy('Buscando el código…');
  try {
    const [{ loadImage }, , { readBarcode }] = await loadMods();
    const img = await loadImage(file);
    const code = await readBarcode(img);
    if (!alive()) return;
    if (code) {
      const p = applyCode(code);
      showMsg(p ? `Código ${code}: ${p.name || 'producto conocido'}.` : `Código ${code} leído.`);
      if (!el.price.value && document.activeElement !== el.name) el.price.focus();
    } else {
      showMsg('No encontramos un código de barras en la foto. Probá más cerca, con buena luz y el código derecho.', 'warn');
    }
  } catch (err) {
    console.error(err);
    if (alive()) showMsg('No pudimos leer el código. Probá con otra foto.', 'warn');
  } finally {
    if (seq === scanSeq) setBusy(null);
  }
}

// ---------- Historial de precios ----------
let histView = { mode: 'list', key: null, q: '' };

$('#btn-history').addEventListener('click', () => {
  histView = { mode: 'list', key: null, q: '' };
  renderHistory();
  openDialog(el.sheetHistory);
});
el.histBack.addEventListener('click', () => {
  histView = { mode: 'list', key: null, q: histView.q };
  renderHistory();
});

function productTitle(p) {
  return p.name || (p.code ? `Código ${p.code}` : 'Producto');
}

function changeTag(ch) {
  if (ch.kind === 'up' || ch.kind === 'down') return trendTag({ kind: ch.kind, pct: ch.pct, prev: ch.from });
  return '<span class="tag neutral">sin cambios</span>';
}

function renderHistory() {
  if (histView.mode === 'detail' && hist.products[histView.key]) return renderHistDetail(hist.products[histView.key]);
  histView.mode = 'list';
  el.histBack.hidden = true;
  el.histTitle.textContent = 'Historial de precios';
  const s = summary(hist);
  if (!s.total) {
    el.histBody.innerHTML = `<div class="hist-empty"><p><strong>Todavía no hay precios guardados.</strong></p><p>Se guardan solos cuando agregás artículos con nombre o código.</p></div>`;
    return;
  }
  el.histBody.innerHTML = `
    <div class="hist-summary">
      <div class="stat up"><b>${s.up}</b><span>${s.up === 1 ? 'subió' : 'subieron'}</span></div>
      <div class="stat down"><b>${s.down}</b><span>${s.down === 1 ? 'bajó' : 'bajaron'}</span></div>
      <div class="stat"><b>${s.unchanged}</b><span>sin cambios</span></div>
    </div>
    <p class="hist-note">Según el último cambio de precio de cada producto · ${plural(s.total, 'producto', 'productos')}</p>
    <label class="field hist-search"><input class="input" id="hist-q" type="search" placeholder="Buscar producto" aria-label="Buscar producto" value="${esc(histView.q)}" /></label>
    <ul class="prods" id="hist-prods"></ul>`;
  const q = $('#hist-q');
  q.addEventListener('input', () => {
    histView.q = q.value;
    renderProdList();
  });
  renderProdList();
}

function renderProdList() {
  const q = normalizeName(histView.q);
  const prods = listProducts(hist).filter((p) => !q || normalizeName(p.name).includes(q) || (p.code || '').includes(q));
  const ul = $('#hist-prods');
  if (!prods.length) {
    ul.innerHTML = `<li class="hist-empty">No hay productos que coincidan.</li>`;
    return;
  }
  ul.innerHTML = prods
    .map((p) => {
      const last = p.points[p.points.length - 1];
      return `<li><button type="button" class="prod" data-key="${esc(p.key)}">
        <span class="prod-name">${esc(productTitle(p))}</span>
        <span class="prod-price">${esc(formatMoney(last.c))}</span>
        <span class="prod-sub">Visto ${esc(relativeTime(last.s))} · ${plural(p.points.length, 'precio', 'precios')}</span>
        <span class="prod-tag">${changeTag(lastChange(p))}</span>
      </button></li>`;
    })
    .join('');
  ul.onclick = (e) => {
    const b = e.target.closest('.prod');
    if (!b) return;
    histView = { mode: 'detail', key: b.dataset.key, q: histView.q };
    renderHistory();
    el.histBody.scrollTop = 0;
  };
}

function chartSVG(points) {
  const W = 320;
  const H = 150;
  const L = 8;
  const R = 8;
  const T = 22;
  const B = 24;
  const ts = points.map((p) => p.t);
  const cs = points.map((p) => p.c);
  const t0 = Math.min(...ts);
  const t1 = Math.max(...ts);
  let c0 = Math.min(...cs);
  let c1 = Math.max(...cs);
  const pad = (c1 - c0) * 0.15 || c1 * 0.1 || 1;
  c0 -= pad;
  c1 += pad;
  const x = (p, i) => (t1 > t0 ? L + ((p.t - t0) / (t1 - t0)) * (W - L - R) : points.length > 1 ? L + (i / (points.length - 1)) * (W - L - R) : W / 2);
  const y = (c) => T + (1 - (c - c0) / (c1 - c0)) * (H - T - B);
  // Línea escalonada suave: el precio se mantiene hasta el siguiente cambio
  const xy = points.map((p, i) => [x(p, i), y(p.c)]);
  let d = '';
  xy.forEach(([px, py], i) => {
    d += i ? ` L${px.toFixed(1)},${py.toFixed(1)}` : `M${px.toFixed(1)},${py.toFixed(1)}`;
  });
  const single = xy.length === 1;
  if (single) d = `M${L},${xy[0][1].toFixed(1)} L${W - R},${xy[0][1].toFixed(1)}`;
  const area = single ? '' : `${d} L${xy[xy.length - 1][0].toFixed(1)},${H - B} L${xy[0][0].toFixed(1)},${H - B} Z`;
  const maxC = Math.max(...cs);
  const minC = Math.min(...cs);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de precios: de ${esc(formatMoney(cs[0]))} a ${esc(formatMoney(cs[cs.length - 1]))}">
    <line class="grid" x1="${L}" x2="${W - R}" y1="${y(maxC).toFixed(1)}" y2="${y(maxC).toFixed(1)}" />
    ${maxC !== minC ? `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(minC).toFixed(1)}" y2="${y(minC).toFixed(1)}" />` : ''}
    <text x="${L}" y="${(y(maxC) - 6).toFixed(1)}">${esc(formatMoney(maxC))}</text>
    ${area ? `<path class="area" d="${area}" />` : ''}
    <path class="line" d="${d}" />
    ${xy.map(([px, py]) => `<circle class="dot" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" />`).join('')}
    <text x="${L}" y="${H - 6}">${esc(fmtShortDate(points[0].t))}</text>
    ${points.length > 1 ? `<text x="${W - R}" y="${H - 6}" text-anchor="end">${esc(fmtShortDate(points[points.length - 1].t))}</text>` : ''}
  </svg>`;
}

function renderHistDetail(p) {
  el.histBack.hidden = false;
  el.histTitle.textContent = productTitle(p);
  const last = p.points[p.points.length - 1];
  const cum = cumulativeChange(p);
  let cumHTML = '';
  if (cum) {
    const kind = cum.to > cum.from ? 'up' : cum.to < cum.from ? 'down' : 'same';
    const word = kind === 'up' ? '▲ Subió' : kind === 'down' ? '▼ Bajó' : 'Sin cambio';
    cumHTML = `<p class="detail-cum ${kind}">${word}${kind === 'same' ? '' : ` ${esc(formatPercent(cum.pct))}`} acumulado desde ${esc(formatMoney(cum.from))} (${esc(fmtDate(p.points[0].t))})</p>`;
  }
  const rows = p.points
    .map((pt, i) => ({ pt, i, prev: p.points[i - 1] }))
    .reverse()
    .map(({ pt, i, prev }) => {
      const when = fmtRange(pt.t, pt.s);
      let tag = '<span class="tag neutral">primer precio</span>';
      if (prev) {
        const pct = pctChange(prev.c, pt.c);
        tag = trendTag({ kind: pt.c > prev.c ? 'up' : 'down', pct, prev: prev.c });
      }
      return `<li class="point">
        <div><div class="point-price">${esc(formatMoney(pt.c))}</div><div class="point-date">${esc(when)}</div></div>
        <div>${tag}</div>
        <button type="button" class="icon-btn" data-del="${i}" aria-label="Borrar precio ${esc(formatMoney(pt.c))}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
        </button>
      </li>`;
    })
    .join('');
  el.histBody.innerHTML = `
    ${p.code && p.name ? `<p class="detail-sub">Código ${esc(p.code)}</p>` : ''}
    <div class="detail-price">${esc(formatMoney(last.c))}</div>
    <p class="detail-sub">Último precio · visto ${esc(relativeTime(last.s))}</p>
    ${cumHTML}
    <div class="chart">${chartSVG(p.points)}</div>
    <form class="update-row" id="hist-update" novalidate>
      <div class="field">
        <label class="field-label" for="hist-price">Actualizar precio</label>
        <div class="price-input"><span aria-hidden="true">$</span><input id="hist-price" type="text" inputmode="decimal" autocomplete="off" placeholder="${esc(centsToInput(last.c))}" /></div>
      </div>
      <button type="submit" class="btn primary">Guardar</button>
    </form>
    <p class="field-error" id="hist-price-err" hidden>Ingresá un precio válido</p>
    <h3 class="section-title">Precios (${p.points.length})</h3>
    <ul class="points">${rows}</ul>
    <div class="danger-zone"><button type="button" class="btn danger-ghost" id="hist-del-product">Borrar producto</button></div>`;

  $('#hist-update').addEventListener('submit', (e) => {
    e.preventDefault();
    const cents = parseMoneyInput($('#hist-price').value);
    if (!cents) {
      $('#hist-price-err').hidden = false;
      return;
    }
    const before = hist;
    const cmp = comparePrice(hist, { name: p.name, code: p.code, cents });
    hist = recordPrice(hist, { name: p.name, code: p.code, cents, now: Date.now() }).store;
    saveHist();
    renderHistory();
    const msg =
      cmp.kind === 'up' || cmp.kind === 'down'
        ? `Precio actualizado: ${cmp.kind === 'up' ? '▲ subió' : '▼ bajó'} ${formatPercent(cmp.pct)}`
        : 'Precio actualizado: igual que la última vez';
    toast(msg, { action: 'Deshacer', onAction: () => restoreHist(before, p.key) });
  });

  el.histBody.querySelector('.points').onclick = (e) => {
    const b = e.target.closest('[data-del]');
    if (!b) return;
    const idx = Number(b.dataset.del);
    const before = hist;
    const removed = p.points[idx];
    hist = deletePoint(hist, p.key, idx);
    saveHist();
    renderHistory();
    toast(`Borraste el precio ${formatMoney(removed.c)}`, { action: 'Deshacer', onAction: () => restoreHist(before, p.key) });
  };

  $('#hist-del-product').addEventListener('click', () => {
    const before = hist;
    hist = deleteProduct(hist, p.key);
    saveHist();
    histView = { mode: 'list', key: null, q: histView.q };
    renderHistory();
    toast(`Borraste «${productTitle(p)}»`, { action: 'Deshacer', onAction: () => restoreHist(before, p.key) });
  });
}

function restoreHist(before, key) {
  hist = before;
  saveHist();
  if (el.sheetHistory.open) {
    histView = { mode: 'detail', key, q: histView.q };
    renderHistory();
  }
}

// ---------- Arranque ----------
render();

// Si la página vuelve de la caché atrás/adelante, de segundo plano u otra pestaña cambió los datos,
// releemos localStorage: así nunca escribimos encima con un estado viejo en memoria.
function reloadState() {
  list = loadJSON(LIST_KEY, sanitizeList, emptyList);
  hist = loadJSON(HIST_KEY, sanitizeStore, emptyStore);
  wasOver = !!limitState(list)?.over;
  render();
  if (el.sheetHistory.open) renderHistory();
}
window.addEventListener('pageshow', (e) => {
  if (e.persisted) reloadState();
});
window.addEventListener('storage', (e) => {
  if (e.key === LIST_KEY || e.key === HIST_KEY) reloadState();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') reloadState();
});

const isNative = !!window.Capacitor?.isNativePlatform?.();
if ('serviceWorker' in navigator) {
  if (isNative) {
    // Dentro del APK los archivos ya son locales: no usamos service worker.
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    if (window.caches) caches.keys().then((ks) => ks.forEach((k) => caches.delete(k))).catch(() => {});
  } else {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}

// Ganchos para pruebas automáticas
window.__compras = {
  get list() {
    return list;
  },
  get hist() {
    return hist;
  },
};
