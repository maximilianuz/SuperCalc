import { formatMoney, parseMoneyInput, centsToInput, formatPercent } from './money.js';
import { loadJSON, saveJSON } from './storage.js';
import { emptyList, sanitizeList, totals, findSame, newId } from './list.js';
import { budgetState, PERIODS, PERIOD_LABEL } from './budget.js';
import { cameraSupported, startCamera, stopCamera, grabFrame, torchSupported, setTorch, cameraErrorText } from './camera.js';
import {
  emptyLedger,
  sanitizeLedger,
  archiveItems,
  groupTrips,
  staleItems,
  closeMonths,
  closeSummary,
  markCloseSeen,
  yearSummary,
  years,
  monthKey,
  dayKey,
  monthLabel,
  prevMonthKey,
  monthTotals,
  isClosed,
  deletePurchase,
  setPlace,
  setPlaceName,
  knownPlaces,
  placeTypeFor,
  monthCSV,
  placeBreakdown,
  PLACES,
  PLACE_LABEL,
} from './ledger.js';
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
  topRiser,
} from './history.js';

const LIST_KEY = 'compras.lista.v1';
const HIST_KEY = 'compras.historial.v1';
const LEDGER_KEY = 'compras.gastos.v1';

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
let ledger = loadJSON(LEDGER_KEY, sanitizeLedger, emptyLedger);
const budget = (now = Date.now()) => budgetState(list, ledger, totals(list).cents, now);
let wasOver = overFlags(budget());
let renderedDay = dayKey(Date.now());

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
  label: $('#total-label'),
  limitBtn: $('#btn-limit'),
  amount: $('#total-amount'),
  meta: $('#total-meta'),
  limitBox: $('#limit-box'),
  limitFill: $('#limit-fill'),
  limitMark: $('#limit-mark'),
  limitText: $('#limit-text'),
  limitPeriod: $('#limit-period'),
  list: $('#list'),
  listHead: $('#list-head'),
  empty: $('#empty'),
  filePhoto: $('#file-photo'),
  fileCode: $('#file-code'),
  fileGallery: $('#file-gallery'),
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

  // Con límite, lo grande es cuánto queda hoy (lo que importa en la góndola); el carrito pasa a segundo plano.
  const b = budget();
  renderedDay = dayKey(Date.now());
  el.limitBox.hidden = !b;
  el.limitText.hidden = !b;
  el.card.classList.toggle('has-limit', !!b);
  el.card.classList.toggle('over', !!b?.over);
  el.label.textContent = b ? 'Carrito' : 'Total';
  el.limitBtn.textContent = b ? `${PERIOD_LABEL[b.period]} ${shortMoney(b.limit)}` : 'Poner límite';
  el.limitPeriod.hidden = true;
  if (b) {
    const scale = Math.max(b.daily, b.spentToday) || 1;
    el.limitFill.style.width = `${Math.min(100, (b.spentToday / scale) * 100)}%`;
    el.limitMark.style.left = `${(b.daily / scale) * 100}%`;
    el.limitBox.classList.toggle('near', !b.over && b.daily > 0 && b.spentToday >= b.daily * 0.9);
    el.limitText.innerHTML = `<span class="lt-kicker">${b.over ? 'Hoy te pasaste por' : 'Te quedan hoy'}</span> <span class="lt-amount">${esc(formatMoney(b.over ? b.excess : b.remaining))}</span>`;
    const lines = periodLines(b);
    el.limitPeriod.hidden = !lines.length;
    el.limitPeriod.innerHTML = lines.map((l) => `<span${l.bad ? ' class="bad"' : ''}>${esc(l.text)}</span>`).join('');
  }
  renderCamTotal();

  el.empty.hidden = list.items.length > 0;
  el.listHead.hidden = list.items.length === 0;
  el.list.innerHTML = list.items.map(itemHTML).join('');
}

const shortMoney = (c) => formatMoney(c).replace(/,00$/, '');
const PERIOD_OF = { week: 'de la semana', month: 'del mes' };

function periodLines(b) {
  if (b.period === 'day') return b.savedToday ? [{ text: `Incluye ${formatMoney(b.savedToday)} ya guardados hoy` }] : [];
  const noun = b.period === 'week' ? 'Semana' : 'Mes';
  const left = b.daysLeft > 1 ? `quedan ${b.daysLeft} días` : 'último día';
  const lines = [{ text: `Sugerido para hoy ${shortMoney(b.daily)} · ${left}` }];
  if (b.periodOver) lines.push({ text: `Te pasaste del límite ${PERIOD_OF[b.period]} por ${formatMoney(b.periodSpent - b.limit)}`, bad: true });
  else lines.push({ text: `${noun}: ${shortMoney(b.periodSpent)} de ${shortMoney(b.limit)}` });
  return lines;
}

function overFlags(b) {
  return { today: !!b?.over, period: !!b?.periodOver };
}

function trendTag(cmp) {
  if (!cmp || (cmp.kind !== 'up' && cmp.kind !== 'down')) return '';
  const arrow = cmp.kind === 'up' ? '▲' : '▼';
  return `<span class="tag ${cmp.kind}" title="${cmp.kind === 'up' ? 'Subió' : 'Bajó'} desde ${esc(formatMoney(cmp.prev))}">${arrow} ${esc(formatPercent(cmp.pct))}</span>`;
}

function itemHTML(it) {
  const name = it.name ? esc(it.name) : 'Artículo sin nombre';
  const pend = it.pending ? '<span class="tag warn">A confirmar</span>' : '';
  const each = it.qty > 1 ? `<span class="item-each">${it.qty} × ${esc(formatMoney(it.cents))}</span>` : '';
  return `<li class="item" data-id="${esc(it.id)}">
    <button type="button" class="item-main" data-act="edit" aria-label="Editar ${name}">
      <div class="item-name${it.name ? '' : ' unnamed'}">${name}</div>
      <div class="item-sub"><b class="item-total">${esc(formatMoney(it.cents * it.qty))}</b>${each}${trendTag(it.cmp)}${pend}</div>
    </button>
    <div class="stepper">
      <button type="button" class="step" data-act="minus" aria-label="Restar uno">−</button>
      <output>${it.qty}</output>
      <button type="button" class="step" data-act="plus" aria-label="Sumar uno">+</button>
    </div>
  </li>`;
}

function commit() {
  saveList();
  render();
  const b = budget();
  const now = overFlags(b);
  if (now.period && !wasOver.period) alertOver(`Superaste el límite ${b.period === 'day' ? 'de hoy' : PERIOD_OF[b.period]}: te pasaste por ${formatMoney(b.periodSpent - b.limit)}`);
  else if (now.today && !wasOver.today && !now.period)
    alertOver(b.period === 'day' ? `Superaste el límite de hoy: te pasaste por ${formatMoney(b.excess)}` : `Pasaste lo sugerido para hoy por ${formatMoney(b.excess)}`);
  wasOver = now;
}

function alertOver(msg) {
  try {
    navigator.vibrate?.([120, 80, 120]);
  } catch {}
  toast(msg, { tone: 'bad', duration: 4500 });
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
    text: `Se van a quitar ${plural(n, 'artículo', 'artículos')} sin guardarlos en Gastos (para guardarlos usá «Terminar compra»). El historial de precios se mantiene.`,
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
const onScroll = () =>
  el.card.classList.toggle('stuck', window.scrollY > 0 && el.card.getBoundingClientRect().top <= parseFloat(getComputedStyle(el.card).top) + 0.5);
window.addEventListener('scroll', onScroll, { passive: true });

// ---------- Límite ----------
let limitDraftPeriod = 'day';
const LIMIT_HINT = {
  day: 'Cuenta todo lo que gastes hoy, también las compras ya guardadas. Te avisamos cuando lo superes.',
  week: 'De lunes a domingo. Te sugerimos cuánto gastar por día para llegar, según lo que ya gastaste.',
  month: 'Del 1 a fin de mes. Te sugerimos cuánto gastar por día para llegar, según lo que ya gastaste.',
};
const PERIOD_CHIP = { day: 'Día', week: 'Semana', month: 'Mes' };
const LIMIT_QUESTION = { day: 'por día', week: 'por semana', month: 'por mes' };

function renderLimitSheet() {
  $('#limit-periods').innerHTML = PERIODS.map(
    (p) => `<button type="button" class="chip" role="radio" aria-checked="${p === limitDraftPeriod}" data-period="${p}">${PERIOD_CHIP[p]}</button>`,
  ).join('');
  $('#limit-hint').textContent = LIMIT_HINT[limitDraftPeriod];
  $('#limit-question').textContent = `¿Cuánto querés gastar como máximo ${LIMIT_QUESTION[limitDraftPeriod]}?`;
  const cents = parseMoneyInput(el.limitInput.value);
  const preview = $('#limit-preview');
  const b = cents && limitDraftPeriod !== 'day' ? budgetState({ limit: cents, period: limitDraftPeriod }, ledger, totals(list).cents) : null;
  preview.hidden = !b;
  if (b) preview.textContent = `Hoy podés gastar hasta ${shortMoney(b.daily)} (${b.daysLeft > 1 ? `quedan ${b.daysLeft} días` : 'último día'})`;
}

$('#btn-limit').addEventListener('click', () => {
  el.limitInput.value = list.limit ? centsToInput(list.limit) : '';
  limitDraftPeriod = list.period;
  el.limitErr.hidden = true;
  $('#btn-limit-remove').hidden = !list.limit;
  renderLimitSheet();
  openDialog(el.sheetLimit);
});

$('#limit-periods').addEventListener('click', (e) => {
  const b = e.target.closest('[data-period]');
  if (!b) return;
  limitDraftPeriod = b.dataset.period;
  renderLimitSheet();
});
el.limitInput.addEventListener('input', renderLimitSheet);

$('#limit-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const cents = parseMoneyInput(el.limitInput.value);
  if (!cents) {
    el.limitErr.hidden = false;
    return;
  }
  list.limit = cents;
  list.period = limitDraftPeriod;
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

  if (draft.mode === 'edit') {
    const it = list.items.find((x) => x.id === draft.id);
    if (!it) return el.sheetItem.close();
    const changed =
      it.cents !== cents || normalizeName(it.name) !== normalizeName(name) || it.code !== code || !!it.pending !== !!pending;
    if (changed) {
      const r = recordFor(it.rec ? revertRecord(hist, it.rec) : hist, { name, code, cents, pending, now });
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

  el.sheetItem.close();
  const { item, merged } = addItem({ name, code, cents, qty, pending });
  if (merged) toast(`Sumamos ${qty} a «${item.name || 'Artículo sin nombre'}» (ahora ${item.qty})`);
}

function recordFor(base, { name, code, cents, pending, now }) {
  if (pending || !productKey({ name, code })) return { base, cmp: null, rec: null };
  const cmp = comparePrice(base, { name, code, cents });
  const r = recordPrice(base, { name, code, cents, now });
  return { base: r.store, cmp, rec: r.rec };
}

// Agrega a la lista (o suma cantidad si ya está con el mismo precio) y guarda el precio en el historial.
function addItem({ name, code, cents, qty, pending }) {
  const now = Date.now();
  const same = findSame(list, { name, code, cents });
  if (same) {
    same.qty = Math.min(9999, same.qty + qty);
    if (code && !same.code) same.code = code;
    if (!same.name && name) same.name = name;
    if (same.pending && !pending) {
      same.pending = null;
      const r = recordFor(hist, { name, code, cents, pending, now });
      hist = r.base;
      same.cmp = r.cmp;
      same.rec = r.rec;
    } else if (!pending) {
      hist = recordPrice(hist, { name: same.name, code: same.code, cents, now }).store;
    }
    saveHist();
    commit();
    return { item: same, merged: true };
  }
  const r = recordFor(hist, { name, code, cents, pending, now });
  hist = r.base;
  const item = { id: newId(), name, code, cents, qty, pending, cmp: r.cmp, rec: r.rec, addedAt: now };
  list.items.unshift(item);
  saveHist();
  commit();
  return { item, merged: false };
}

// ---------- Foto del precio y código de barras ----------
// Destino del próximo archivo elegido (cámara del sistema o galería).
let fileTarget = { kind: 'photo', keep: false };

function pickFile(input, kind, keep) {
  fileTarget = { kind, keep };
  input.value = '';
  input.click();
}

$('#btn-scan').addEventListener('click', () => openCamera('scan', false));
$('#btn-item-photo').addEventListener('click', () => openCamera('photo', true));
$('#btn-item-code').addEventListener('click', () => openCamera('code', true));
$('#btn-manual').addEventListener('click', () => {
  openItemSheet({ mode: 'add' });
  el.price.focus();
});

function onFile(input, kind) {
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    const target = { ...fileTarget, kind: kind || fileTarget.kind };
    fileTarget = { kind: 'photo', keep: false };
    if (!f) return;
    const keep = target.keep && el.sheetItem.open;
    if (target.kind === 'code') processCode(({ loadImage }) => loadImage(f), keep);
    else processPhoto(({ loadImage }) => loadImage(f), keep);
  });
}
onFile(el.filePhoto, 'photo');
onFile(el.fileCode, 'code');
onFile(el.fileGallery, null);

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

const loadMods = () =>
  Promise.all([import('./imageutil.js'), import('./ocr.js'), import('./barcode.js')]).then(([a, b, c]) => ({ ...a, ...b, ...c }));

function applyCode(code) {
  draft.code = code;
  const p = findByCode(hist, code);
  if (p && p.name && !el.name.value.trim()) el.name.value = p.name;
  syncDraftUI();
  return p;
}

function codeMessage(code, p) {
  showMsg(p ? `Código ${code}: ${p.name || 'producto conocido'}.` : `Código ${code} leído.`);
  if (!el.price.value && document.activeElement !== el.name) el.price.focus();
}

// Foto del precio: getImg(mods) devuelve la imagen (archivo o cuadro de la cámara).
async function processPhoto(getImg, keep, presetCode = null) {
  if (!keep) openItemSheet({ mode: 'add' });
  const seq = ++scanSeq;
  const alive = () => seq === scanSeq && el.sheetItem.open;
  showMsg('');
  el.scanBox.hidden = true;
  setBusy('Abriendo la foto…');
  try {
    const mods = await loadMods();
    const img = await getImg(mods);
    if (!alive()) return;
    let code = null;
    if (!draft.code) {
      if (presetCode) code = presetCode;
      else {
        setBusy('Buscando código de barras…');
        try {
          code = await mods.readBarcode(img);
        } catch {}
      }
      if (!alive()) return;
      if (code) applyCode(code);
    }
    const res = await mods.readPrice(img, (t) => alive() && setBusy(t));
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

async function processCode(getImg, keep) {
  if (!keep) openItemSheet({ mode: 'add' });
  const seq = ++scanSeq;
  const alive = () => seq === scanSeq && el.sheetItem.open;
  showMsg('');
  setBusy('Buscando el código…');
  try {
    const mods = await loadMods();
    const img = await getImg(mods);
    const code = await mods.readBarcode(img);
    if (!alive()) return;
    if (code) codeMessage(code, applyCode(code));
    else showMsg('No encontramos un código de barras en la foto. Probá más cerca, con buena luz y el código derecho.', 'warn');
  } catch (err) {
    console.error(err);
    if (alive()) showMsg('No pudimos leer el código. Probá con otra foto.', 'warn');
  } finally {
    if (seq === scanSeq) setBusy(null);
  }
}

// ---------- Cámara en vivo ----------
const cam = { mode: 'photo', keep: false, stream: null, loop: 0, code: null, readSeq: 0 };
const camEl = {
  dlg: $('#sheet-camera'),
  video: $('#cam-video'),
  frame: $('#cam-frame'),
  hint: $('#cam-hint'),
  status: $('#cam-status'),
  error: $('#cam-error'),
  errorText: $('#cam-error-text'),
  shutter: $('#cam-shutter'),
  torch: $('#cam-torch'),
  total: $('#cam-total'),
  card: $('#cam-card'),
  bottom: $('#sheet-camera .cam-bottom'),
};
const buzz = (p) => {
  try {
    navigator.vibrate?.(p);
  } catch {}
};

function openCamera(mode, keep) {
  if (!cameraSupported()) return pickFile(mode === 'code' ? el.fileCode : el.filePhoto, mode === 'code' ? 'code' : 'photo', keep);
  cam.mode = mode;
  cam.keep = keep;
  cam.code = null;
  camEl.dlg.classList.toggle('code', mode === 'code');
  camEl.dlg.classList.toggle('scan', mode === 'scan');
  camEl.hint.textContent = { code: 'Apuntá al código de barras', scan: 'Apuntá al código o al precio' }[mode] || 'Apuntá al cartel del precio';
  camEl.shutter.setAttribute('aria-label', { code: 'Sacar foto del código', scan: 'Leer el precio del cartel' }[mode] || 'Sacar foto del precio');
  sc = scIdle();
  renderScanCard();
  camEl.total.hidden = mode !== 'scan';
  camEl.status.hidden = true;
  camEl.error.hidden = true;
  camEl.frame.classList.remove('found');
  camEl.shutter.disabled = true;
  camEl.torch.hidden = true;
  camEl.torch.setAttribute('aria-pressed', 'false');
  openDialog(camEl.dlg);
  renderCamTotal();
  const id = ++cam.loop;
  startCamera(camEl.video)
    .then((stream) => {
      if (id !== cam.loop || !camEl.dlg.open) return stopCamera(stream);
      cam.stream = stream;
      camEl.shutter.disabled = false;
      camEl.torch.hidden = !torchSupported(stream);
      scanLoop(id);
    })
    .catch((err) => {
      if (id !== cam.loop) return;
      console.error(err);
      camEl.errorText.textContent = cameraErrorText(err);
      camEl.error.hidden = false;
    });
}

camEl.dlg.addEventListener('close', () => {
  cam.loop++;
  cam.readSeq++;
  sc = scIdle();
  renderScanCard();
  stopCamera(cam.stream, camEl.video);
  cam.stream = null;
});

async function scanLoop(id) {
  const { readBarcodeFrame } = await import('./barcode.js');
  while (id === cam.loop && camEl.dlg.open) {
    // Con la tarjeta de un producto a la vista no seguimos buscando: la persona está decidiendo.
    if (cam.mode === 'scan' && sc.phase !== 'idle') {
      await new Promise((r) => setTimeout(r, 220));
      continue;
    }
    const frame = grabFrame(camEl.video, 1000);
    let code = null;
    if (frame) {
      try {
        code = await readBarcodeFrame(frame);
      } catch {}
    }
    if (id !== cam.loop) return;
    if (code && cam.mode === 'scan') onScanCode(code);
    else if (code) {
      buzz(40);
      if (cam.mode === 'code') {
        const keep = cam.keep;
        camEl.dlg.close();
        if (!keep || !el.sheetItem.open) openItemSheet({ mode: 'add' });
        codeMessage(code, applyCode(code));
        return;
      }
      if (code !== cam.code) {
        cam.code = code;
        camEl.frame.classList.add('found');
        camEl.status.textContent = `Código ${code} ✓ · ahora sacale foto al precio`;
        camEl.status.hidden = false;
      }
    }
    await new Promise((r) => setTimeout(r, 220));
  }
}

camEl.shutter.addEventListener('click', () => {
  if (cam.mode === 'scan') return readScanPrice();
  const frame = grabFrame(camEl.video, 2000);
  if (!frame) return;
  const { mode, keep, code } = cam;
  camEl.dlg.close();
  const k = keep && el.sheetItem.open;
  if (mode === 'code') processCode(async () => frame, k);
  else processPhoto(async () => frame, k, code);
});

$('#cam-gallery').addEventListener('click', () => {
  const { keep } = cam;
  const mode = cam.mode === 'code' ? 'code' : 'photo';
  camEl.dlg.close();
  pickFile(el.fileGallery, mode, keep);
});
$('#cam-fallback').addEventListener('click', () => {
  const { keep } = cam;
  const mode = cam.mode === 'code' ? 'code' : 'photo';
  camEl.dlg.close();
  pickFile(mode === 'code' ? el.fileCode : el.filePhoto, mode, keep);
});
camEl.torch.addEventListener('click', async () => {
  const on = camEl.torch.getAttribute('aria-pressed') !== 'true';
  if (await setTorch(cam.stream, on)) camEl.torch.setAttribute('aria-pressed', String(on));
});

// ---------- Escaneo continuo: la cámara queda abierta y cada producto se agrega desde una tarjeta ----------
// Fases: idle (buscando) · known (código con precio guardado) · unknown (código nuevo) ·
// reading (OCR del cartel) · price (precio leído) · noprice (no se encontró precio).
const scIdle = () => ({ phase: 'idle' });
let sc = scIdle();
let scIgnore = { code: null, until: 0 }; // tras agregar o descartar, el mismo código no reaparece enseguida

function renderCamTotal() {
  if (!camEl.dlg.open || cam.mode !== 'scan') return;
  const t = totals(list);
  camEl.total.textContent = t.count ? `${formatMoney(t.cents)} · ${plural(t.count, 'artículo', 'artículos')}` : 'Lista vacía';
}

function onScanCode(code) {
  if (code === scIgnore.code && Date.now() < scIgnore.until) return;
  buzz(40);
  const product = findByCode(hist, code);
  const last = product && product.points[product.points.length - 1];
  sc = { phase: last ? 'known' : 'unknown', code, product, cents: last ? last.c : 0, since: last ? last.s : 0, pending: null, qty: 1, res: null, cands: [], sel: -1 };
  renderScanCard();
}

function pickScanCand(i) {
  const c = sc.cands[i];
  if (!c) return;
  sc.sel = i;
  sc.cents = c.cents;
  sc.pending = c.own.length ? [...c.own] : null;
}

async function readScanPrice() {
  const frame = grabFrame(camEl.video, 2000);
  if (!frame) return;
  const seq = ++cam.readSeq;
  const alive = () => seq === cam.readSeq && camEl.dlg.open;
  sc = { ...scIdle(), code: null, product: null, qty: 1, ...sc, phase: 'reading', pending: null, res: null, cands: [], sel: -1 };
  renderScanCard();
  try {
    const mods = await loadMods();
    if (!sc.code) {
      let code = null;
      try {
        code = await mods.readBarcode(frame);
      } catch {}
      if (!alive()) return;
      if (code) sc = { ...sc, code, product: findByCode(hist, code) };
    }
    const res = await mods.readPrice(frame);
    if (!alive()) return;
    const cands = res.candidates.slice(0, 5);
    sc = { ...sc, res, cands, phase: cands.length ? 'price' : 'noprice' };
    if (cands.length) pickScanCand(Math.max(0, cands.findIndex((c) => c.suggested)));
  } catch (err) {
    console.error(err);
    if (!alive()) return;
    sc = { ...sc, phase: 'noprice' };
  }
  renderScanCard();
}

function scanTrend() {
  if (sc.pending) return `<p class="cc-trend warn">A confirmar · ${esc(sc.pending.map((id) => SHORT_RULE[id] || id).join(', '))}</p>`;
  const name = sc.product?.name || '';
  const code = sc.code || '';
  if (!productKey({ name, code })) return '';
  const cmp = comparePrice(hist, { name, code, cents: sc.cents });
  if (cmp.kind === 'up' || cmp.kind === 'down') {
    return `<p class="cc-trend ${cmp.kind}">${cmp.kind === 'up' ? '▲' : '▼'} ${esc(formatPercent(cmp.pct))} · antes ${esc(formatMoney(cmp.prev))} (${esc(relativeTime(cmp.since))})</p>`;
  }
  if (cmp.kind === 'same') return `<p class="cc-trend">Igual que la última vez (${esc(relativeTime(cmp.since))})</p>`;
  return '<p class="cc-trend">Primera vez que lo cargás</p>';
}

function renderScanCard() {
  const on = sc.phase !== 'idle';
  camEl.card.hidden = !on;
  camEl.bottom.hidden = on;
  if (!on) {
    camEl.card.innerHTML = '';
    return;
  }
  const name = sc.product?.name || '';
  const title = name || (sc.code ? 'Producto nuevo' : 'Precio del cartel');
  const codeTxt = sc.code ? `Código ${sc.code}` : '';
  const stepper = `<div class="stepper"><button type="button" class="step" data-act="minus" aria-label="Restar uno">−</button><output>${sc.qty}</output><button type="button" class="step" data-act="plus" aria-label="Sumar uno">+</button></div>`;
  const add = `<button type="button" class="btn primary grow" data-act="add">Añadir · ${esc(formatMoney(sc.cents * sc.qty))}</button>`;
  const write = (cls = 'small secondary') => `<button type="button" class="btn ${cls}" data-act="write">Escribir</button>`;
  let sub = codeTxt;
  let body = '';
  let actions = '';
  if (sc.phase === 'known') {
    sub = [codeTxt, `último precio ${relativeTime(sc.since)}`].filter(Boolean).join(' · ');
    body = `<p class="cc-price">${esc(formatMoney(sc.cents))}</p>
      <div class="cc-alt"><span>¿Cambió el precio?</span><button type="button" class="btn small secondary" data-act="read">Leer del cartel</button>${write()}</div>`;
    actions = stepper + add;
  } else if (sc.phase === 'unknown') {
    body = '<p class="cc-text">Es la primera vez que lo escaneás. Leé el precio del cartel para agregarlo.</p>';
    actions = `${write('secondary')}<button type="button" class="btn primary grow" data-act="read">Leer precio</button>`;
  } else if (sc.phase === 'reading') {
    body = '<div class="busy" role="status"><span class="spinner" aria-hidden="true"></span><span>Leyendo el precio…</span></div>';
  } else if (sc.phase === 'noprice') {
    body = '<p class="cc-text">No encontramos el precio. Acercate al cartel o escribilo.</p>';
    actions = `${write('secondary')}<button type="button" class="btn primary grow" data-act="read">Reintentar</button>`;
  } else if (sc.phase === 'price') {
    const others = sc.cands
      .map((c, i) => ({ c, i }))
      .filter(({ i }) => i !== sc.sel)
      .map(({ c, i }) => {
        const note = c.own.length ? c.own.map((id) => SHORT_RULE[id] || id).join(', ') : '';
        return `<button type="button" class="chip cc-chip" data-act="pick" data-i="${i}"><b>${esc(formatMoney(c.cents))}</b>${note ? `<small>${esc(note)}</small>` : ''}</button>`;
      })
      .join('');
    body = `<p class="cc-price">${esc(formatMoney(sc.cents))}</p>${scanTrend()}
      <div class="cc-alt">${others ? '<span>¿Otro precio?</span>' : ''}${others}${write()}</div>`;
    actions = stepper + add;
  }
  camEl.card.innerHTML = `
    <div class="cc-head">
      <div class="cc-id"><p class="cc-name">${esc(title)}</p>${sub ? `<p class="cc-sub">${esc(sub)}</p>` : ''}</div>
      <button type="button" class="icon-btn cc-x" data-act="dismiss" aria-label="Descartar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
    </div>
    ${body}
    ${actions ? `<div class="cc-actions">${actions}</div>` : ''}`;
}

camEl.card.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 'read') return readScanPrice();
  if (act === 'write') return scanToSheet();
  if (act === 'add') return scanAdd();
  if (act === 'dismiss') {
    scIgnore = { code: sc.code, until: Date.now() + 2500 };
    cam.readSeq++;
    sc = scIdle();
  } else if (act === 'minus') sc.qty = Math.max(1, sc.qty - 1);
  else if (act === 'plus') sc.qty = Math.min(9999, sc.qty + 1);
  else if (act === 'pick') pickScanCand(Number(b.dataset.i));
  renderScanCard();
});

function scanAdd() {
  if (!sc.cents) return;
  const before = { items: JSON.parse(JSON.stringify(list.items)), hist };
  const spent = sc.cents * sc.qty;
  const { item } = addItem({ name: sc.product?.name || '', code: sc.code || '', cents: sc.cents, qty: sc.qty, pending: sc.pending });
  scIgnore = { code: sc.code, until: Date.now() + 3000 };
  sc = scIdle();
  renderScanCard();
  toast(`Añadiste «${item.name || 'Artículo sin nombre'}» · ${formatMoney(spent)}`, {
    action: 'Deshacer',
    onAction: () => {
      list.items = before.items;
      hist = before.hist;
      saveHist();
      commit();
    },
  });
}

// «Escribir»: pasa lo leído a la hoja de siempre (nombre, código, precios detectados) y cierra la cámara.
function scanToSheet() {
  const { code, res, cents, pending, qty, phase } = sc;
  camEl.dlg.close();
  openItemSheet({ mode: 'add' });
  draft.qty = qty || 1;
  if (code) applyCode(code);
  if (res && res.candidates.length) showCandidates(res, code);
  if (cents && (phase === 'price' || phase === 'known')) {
    el.price.value = centsToInput(cents);
    draft.picked = cents;
    draft.pending = pending ? [...pending] : null;
  }
  syncDraftUI();
  el.price.focus();
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

// ---------- Gastos: terminar compra, cambio de día, cierres mensuales e historial anual ----------
let skipStale = false; // si la persona deshizo el guardado automático, no insistimos hasta reabrir
const saveLedger = () => saveJSON(LEDGER_KEY, ledger);
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const cap = (str) => str.charAt(0).toUpperCase() + str.slice(1);
const hhmm = (t) => {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const dayDate = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const dayLabel = (day) => {
  const d = dayDate(day);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
const relDay = (day) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today - dayDate(day)) / 86_400_000);
  return diff === 0 ? 'Hoy' : diff === 1 ? 'Ayer' : cap(dayLabel(day));
};
const timeRange = (p) => (p.start && p.end ? (hhmm(p.start) === hhmm(p.end) ? hhmm(p.start) : `${hhmm(p.start)}–${hhmm(p.end)}`) : '');
const pctSpan = (pct, vs) =>
  pct == null ? '' : `<span class="${pct > 0 ? 'up' : pct < 0 ? 'down' : ''}">${pct > 0 ? '▲' : pct < 0 ? '▼' : '='} ${esc(formatPercent(pct))} vs ${esc(vs)}</span>`;
const monthName = (mk) => monthLabel(mk).split(' ')[0];

// Terminar compra: primero los lugares donde ya compraste (un toque); «Otro lugar» para escribir uno nuevo.
let finishPlace = '';
let finishSel = null; // índice de un lugar frecuente, 'other' o null
let finishKnown = [];
const sheetFinish = $('#sheet-finish');
const finishName = $('#finish-place-name');
const finishSave = $('#btn-finish-save');

let finishPlacePicked = false; // la persona eligió el tipo a mano: no lo pisamos al escribir el lugar

function fillKnownPlaces() {
  $('#known-places').innerHTML = knownPlaces(ledger)
    .slice(0, 100)
    .map((p) => `<option value="${esc(p.name)}"></option>`)
    .join('');
}

$('#btn-finish').addEventListener('click', () => {
  if (!list.items.length) return;
  finishPlace = '';
  finishPlacePicked = false;
  finishName.value = '';
  finishKnown = knownPlaces(ledger).slice(0, 4);
  finishSel = finishKnown.length ? null : 'other';
  fillKnownPlaces();
  renderFinish();
  openDialog(sheetFinish);
});

finishName.addEventListener('input', () => {
  updateFinishSave();
  if (finishPlacePicked) return;
  const t = placeTypeFor(ledger, finishName.value);
  if (t && t !== finishPlace) {
    finishPlace = t;
    $('#finish-places').innerHTML = placeChips(finishPlace);
  }
});

function placeChips(selected) {
  return PLACES.map(
    (p) => `<button type="button" class="chip" role="radio" aria-checked="${p.id === selected}" data-place="${p.id}">${esc(p.label)}</button>`,
  ).join('');
}

function updateFinishSave() {
  const name = finishName.value.replace(/\s+/g, ' ').trim();
  finishSave.textContent = name ? `Guardar en ${name}` : 'Guardar en Gastos';
}

function renderFinish() {
  const trips = groupTrips(list.items, Date.now());
  const t = totals(list);
  $('#finish-total').textContent = formatMoney(t.cents);
  const one = trips.length === 1 ? trips[0] : null;
  const when = one ? (hhmm(one.start) === hhmm(one.end) ? ` a las ${hhmm(one.start)}` : ` de ${hhmm(one.start)} a ${hhmm(one.end)}`) : '';
  $('#finish-sub').textContent = `${plural(t.count, 'artículo', 'artículos')}${one ? ` · ${relDay(one.day).toLowerCase()}${when}` : ''}`;
  $('#finish-trips').innerHTML = trips
    .map((g) => {
      const total = g.items.reduce((sum, it) => sum + it.cents * it.qty, 0);
      const range = hhmm(g.start) === hhmm(g.end) ? hhmm(g.start) : `${hhmm(g.start)}–${hhmm(g.end)}`;
      return `<li><span>${esc(relDay(g.day))} · ${esc(range)} · ${plural(g.items.length, 'artículo', 'artículos')}</span><span>${esc(formatMoney(total))}</span></li>`;
    })
    .join('');
  $('#finish-trips').hidden = trips.length < 2;
  renderFinishPlaces();
}

function renderFinishPlaces() {
  const known = $('#finish-known');
  known.hidden = !finishKnown.length;
  known.innerHTML = finishKnown.length
    ? finishKnown
        .map(
          (k, i) => `<button type="button" class="place-row" role="radio" aria-checked="${finishSel === i}" data-sel="${i}">
        <span class="pr-name">${esc(k.name)}</span>
        <span class="pr-sub">${esc(PLACE_LABEL[k.place] || 'Sin tipo')}</span>
        <span class="pr-count">${plural(k.count, 'compra', 'compras')}</span>
      </button>`,
        )
        .join('') +
      `<button type="button" class="place-row other" role="radio" aria-checked="${finishSel === 'other'}" data-sel="other">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg><span class="pr-name">Otro lugar</span>
      </button>`
    : '';
  $('#finish-other').hidden = finishSel !== 'other';
  $('#finish-places').innerHTML = placeChips(finishPlace);
  updateFinishSave();
}

$('#finish-known').addEventListener('click', (e) => {
  const b = e.target.closest('[data-sel]');
  if (!b) return;
  const sel = b.dataset.sel === 'other' ? 'other' : Number(b.dataset.sel);
  if (sel === finishSel && sel !== 'other') finishSel = null;
  else finishSel = sel;
  finishPlacePicked = false;
  if (typeof finishSel === 'number') {
    finishName.value = finishKnown[finishSel].name;
    finishPlace = finishKnown[finishSel].place;
  } else {
    finishName.value = '';
    finishPlace = '';
  }
  renderFinishPlaces();
  if (finishSel === 'other') finishName.focus();
});

$('#finish-places').addEventListener('click', (e) => {
  const b = e.target.closest('[data-place]');
  if (!b) return;
  finishPlace = finishPlace === b.dataset.place ? '' : b.dataset.place;
  finishPlacePicked = true;
  $('#finish-places').innerHTML = placeChips(finishPlace);
});

$('#finish-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!list.items.length) return sheetFinish.close();
  const before = { ledger, items: list.items };
  const total = totals(list).cents;
  ledger = archiveItems(ledger, list.items, { place: finishPlace, placeName: finishName.value, now: Date.now() }).ledger;
  list.items = [];
  saveLedger();
  sheetFinish.close();
  commit();
  toast(`Guardamos la compra en Gastos (${formatMoney(total)})`, {
    action: 'Deshacer',
    onAction: () => {
      ledger = before.ledger;
      list.items = before.items.concat(list.items);
      saveLedger();
      commit();
    },
  });
});

// Cambio de día y de mes: la compra de un día anterior se guarda sola; los meses pasados se cierran.
function rollover() {
  const now = Date.now();
  const stale = skipStale ? [] : staleItems(list.items, now);
  if (stale.length) {
    const before = { ledger, items: list.items };
    const total = stale.reduce((sum, it) => sum + it.cents * it.qty, 0);
    const days = new Set(stale.map((it) => dayKey(it.addedAt)));
    ledger = archiveItems(ledger, stale, { now, auto: true }).ledger;
    const ids = new Set(stale.map((it) => it.id));
    list.items = list.items.filter((it) => !ids.has(it.id));
    saveLedger();
    commit();
    const when = days.size === 1 ? `del ${dayLabel(dayKey(stale[0].addedAt))}` : 'de días anteriores';
    toast(`Guardamos en Gastos la compra ${when} (${formatMoney(total)}). Empezás una lista nueva.`, {
      action: 'Deshacer',
      duration: 9000,
      onAction: () => {
        skipStale = true;
        ledger = before.ledger;
        list.items = before.items;
        saveLedger();
        commit();
      },
    });
  }
  const r = closeMonths(ledger, now);
  if (r.closed.length) {
    ledger = r.ledger;
    saveLedger();
  }
  // Pasada la medianoche cambia lo que queda para hoy
  if (dayKey(now) !== renderedDay) {
    render();
    wasOver = overFlags(budget());
  }
  renderCloseCard();
}

const closeCard = $('#close-card');
function renderCloseCard() {
  const c = ledger.closes.filter((x) => !x.seen).pop();
  closeCard.hidden = !c;
  if (!c) return;
  const sum = closeSummary(ledger, c.month);
  closeCard.dataset.month = c.month;
  closeCard.innerHTML = `
    <p class="close-kicker">Cierre de ${esc(monthLabel(c.month))}</p>
    <p class="close-total">${esc(formatMoney(sum.total))}</p>
    <p class="close-meta">${plural(sum.count, 'compra', 'compras')}${sum.pct != null ? ` · ${pctSpan(sum.pct, monthName(prevMonthKey(c.month)))}` : ''}</p>
    <div class="close-actions">
      <button type="button" class="btn small secondary" data-act="see">Ver resumen</button>
      <button type="button" class="btn small secondary" data-act="export">Exportar CSV</button>
    </div>
    <button type="button" class="icon-btn close-x" data-act="dismiss" aria-label="Cerrar resumen del mes">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>`;
}

closeCard.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const mk = closeCard.dataset.month;
  if (b.dataset.act === 'export') return exportMonth(mk);
  ledger = markCloseSeen(ledger, mk);
  saveLedger();
  renderCloseCard();
  if (b.dataset.act === 'see') openRecap(mk);
});

// Resumen del mes cerrado: total, comparación, gasto por lugar y el producto que más subió.
const sheetRecap = $('#sheet-recap');
let recapMonth = null;

function openRecap(mk) {
  recapMonth = mk;
  renderRecap();
  openDialog(sheetRecap);
}

function renderRecap() {
  const mk = recapMonth;
  const sum = closeSummary(ledger, mk);
  const places = placeBreakdown(ledger, mk);
  const max = Math.max(1, ...places.map((x) => x.total));
  const [y, m] = mk.split('-').map(Number);
  const riser = topRiser(hist, new Date(y, m - 1, 1).getTime(), new Date(y, m, 1).getTime());
  const pct =
    sum.pct == null
      ? ''
      : `<span class="tag ${sum.pct > 0 ? 'up' : 'down'}">${sum.pct > 0 ? '▲' : sum.pct < 0 ? '▼' : '='} ${esc(formatPercent(sum.pct))} vs ${esc(monthName(prevMonthKey(mk)))}</span>`;
  $('#recap-body').innerHTML = `
    <h2 class="recap-title" id="recap-title">${esc(cap(monthLabel(mk)))}</h2>
    <p class="recap-total">${esc(formatMoney(sum.total))}</p>
    <p class="recap-meta">${pct}<span>${plural(sum.count, 'compra', 'compras')}${sum.count > 1 ? ` · promedio ${esc(formatMoney(Math.round(sum.total / sum.count)))}` : ''}</span></p>
    ${
      places.length
        ? `<section class="recap-card"><h3>Por lugar</h3><ul class="recap-places">${places
            .map(
              (p, i) =>
                `<li><span>${esc(p.name)}</span><b>${esc(formatMoney(p.total))}</b><span class="track"><span class="fill${i ? '' : ' top'}" style="width:${((p.total / max) * 100).toFixed(1)}%"></span></span></li>`,
            )
            .join('')}</ul></section>`
        : ''
    }
    ${
      riser
        ? `<section class="recap-card recap-riser"><span class="riser-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 17l5-5 4 4 8-8" /><path d="M14 8h6v6" /></svg></span>
        <div><p class="riser-k">Lo que más subió</p><p class="riser-name">${esc(riser.name || `Código ${riser.code}`)}</p></div>
        <div class="riser-num"><b>▲ ${esc(formatPercent(riser.pct))}</b><span>${esc(formatMoney(riser.from))} → ${esc(formatMoney(riser.to))}</span></div></section>`
        : ''
    }`;
}

$('#recap-export').addEventListener('click', () => exportMonth(recapMonth));
$('#recap-see').addEventListener('click', () => {
  const mk = recapMonth;
  sheetRecap.close();
  openGastos({ mode: 'month', year: Number(mk.slice(0, 4)), month: mk });
});

// Pantalla de gastos
const sheetGastos = $('#sheet-gastos');
const gBody = $('#gastos-body');
let gv = { mode: 'year', year: new Date().getFullYear(), month: null, id: null };

$('#btn-gastos').addEventListener('click', () => openGastos());
$('#gastos-back').addEventListener('click', () => {
  if (gv.mode === 'purchase') gv = { ...gv, mode: 'month', id: null };
  else gv = { ...gv, mode: 'year', month: null };
  renderGastos();
});

function openGastos(view) {
  gv = view || { mode: 'year', year: new Date().getFullYear(), month: null, id: null };
  renderGastos();
  openDialog(sheetGastos);
}

function inProgress() {
  return list.items.length ? { month: monthKey(Date.now()), cents: totals(list).cents } : null;
}

function renderGastos() {
  gBody.scrollTop = 0;
  if (gv.mode === 'purchase' && ledger.purchases.some((p) => p.id === gv.id)) return renderPurchase();
  if (gv.mode === 'month' || gv.mode === 'purchase') {
    gv.mode = 'month';
    return renderMonth();
  }
  renderYear();
}

function barsSVG(y) {
  const W = 320;
  const H = 150;
  const T = 14;
  const B = 22;
  const cur = monthKey(Date.now());
  const max = Math.max(1, ...y.months.map((m) => m.total + m.inProgress));
  const slot = W / 12;
  const bw = slot * 0.56;
  const ini = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const bars = y.months
    .map((m, i) => {
      const x = i * slot + (slot - bw) / 2;
      const h1 = ((H - T - B) * m.total) / max;
      const h2 = ((H - T - B) * m.inProgress) / max;
      const base = H - B;
      const isCur = m.month === cur;
      let r = '';
      if (!m.total && !m.inProgress) r = `<rect class="bar empty" x="${x.toFixed(1)}" y="${base - 2}" width="${bw.toFixed(1)}" height="2" rx="1" />`;
      if (m.total) r += `<rect class="bar${isCur ? ' cur' : ''}" x="${x.toFixed(1)}" y="${(base - h1).toFixed(1)}" width="${bw.toFixed(1)}" height="${h1.toFixed(1)}" rx="3" />`;
      if (m.inProgress) r += `<rect class="bar prog" x="${x.toFixed(1)}" y="${(base - h1 - h2).toFixed(1)}" width="${bw.toFixed(1)}" height="${h2.toFixed(1)}" rx="3" />`;
      return `${r}<text class="lab${isCur ? ' cur' : ''}" x="${(i * slot + slot / 2).toFixed(1)}" y="${H - 6}">${ini[i]}</text>`;
    })
    .join('');
  const best = y.months.reduce((a, m) => (m.total > a.total ? m : a), y.months[0]);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gasto por mes en ${y.year}${best.total ? `; el mes más alto fue ${esc(monthName(best.month))} con ${esc(formatMoney(best.total))}` : ''}">${bars}</svg>`;
}

function renderYear() {
  $('#gastos-back').hidden = true;
  $('#gastos-title').textContent = 'Gastos';
  const now = Date.now();
  const ys = years(ledger, now);
  const thisYear = new Date(now).getFullYear();
  const y = yearSummary(ledger, gv.year, inProgress());
  const rows = y.months
    .filter((m) => m.count || m.inProgress)
    .reverse()
    .map((m) => {
      const prev = monthTotals(ledger, prevMonthKey(m.month));
      const pct = prev.count && prev.total && m.count ? ((m.total - prev.total) / prev.total) * 100 : null;
      const state = m.closed ? 'cerrado' : m.month === monthKey(now) ? 'en curso' : '';
      const sub = [plural(m.count, 'compra', 'compras'), state, m.inProgress ? `${formatMoney(m.inProgress)} sin guardar` : ''].filter(Boolean).join(' · ');
      return `<li><button type="button" class="month-row" data-month="${m.month}">
        <span class="row-title">${esc(monthName(m.month))}</span>
        <span class="row-amount">${esc(formatMoney(m.total + m.inProgress))}</span>
        <span class="row-sub">${esc(sub)}</span>
        <span class="row-tag">${pct == null ? '' : trendTag({ kind: pct > 0 ? 'up' : 'down', pct, prev: prev.total })}</span>
      </button></li>`;
    })
    .join('');
  gBody.innerHTML = `
    <div class="year-nav">
      <button type="button" class="icon-btn" id="g-prev" aria-label="Año anterior" ${gv.year <= ys[0] ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
      <b id="g-year">${gv.year}</b>
      <button type="button" class="icon-btn" id="g-next" aria-label="Año siguiente" ${gv.year >= thisYear ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg></button>
    </div>
    <div class="big-total" id="g-total">${esc(formatMoney(y.total))}</div>
    <p class="sub-line">${plural(y.count, 'compra guardada', 'compras guardadas')}${y.monthsWithData ? ` · promedio ${esc(formatMoney(y.average))} por mes (${plural(y.monthsWithData, 'mes', 'meses')} con compras)` : ''}</p>
    <div class="chart bars">${barsSVG(y)}</div>
    ${rows ? `<h3 class="section-title">Meses</h3><ul class="prods">${rows}</ul>` : `<div class="hist-empty"><p><strong>Todavía no hay compras guardadas en ${gv.year}.</strong></p><p>Cuando tocás «Terminar compra», o al día siguiente, la compra se guarda acá con su fecha.</p></div>`}`;
  $('#g-prev').onclick = () => {
    gv.year--;
    renderGastos();
  };
  $('#g-next').onclick = () => {
    gv.year++;
    renderGastos();
  };
  for (const b of gBody.querySelectorAll('.month-row')) b.onclick = () => {
    gv = { ...gv, mode: 'month', month: b.dataset.month };
    renderGastos();
  };
}

function renderMonth() {
  const mk = gv.month;
  $('#gastos-back').hidden = false;
  $('#gastos-title').textContent = cap(monthLabel(mk));
  const sum = closeSummary(ledger, mk);
  const t = monthTotals(ledger, mk);
  const prog = inProgress();
  const closed = isClosed(ledger, mk);
  const closeRec = ledger.closes.find((c) => c.month === mk);
  const state = closed ? `Cerrado el ${fmtDate(closeRec.closedAt)}` : mk === monthKey(Date.now()) ? 'En curso' : '';
  const places = Object.entries(sum.byPlace).sort((a, b) => b[1] - a[1]);
  const maxPlace = Math.max(1, ...places.map((x) => x[1]));
  gBody.innerHTML = `
    <div class="big-total">${esc(formatMoney(sum.total))}</div>
    <p class="sub-line">${[plural(sum.count, 'compra', 'compras'), state].filter(Boolean).map(esc).join(' · ')}${sum.pct != null ? ` · ${pctSpan(sum.pct, monthName(prevMonthKey(mk)))}` : ''}</p>
    ${prog && prog.month === mk ? `<p class="sub-line">Más ${esc(formatMoney(prog.cents))} de la lista actual, todavía sin guardar.</p>` : ''}
    ${t.purchases.length ? `<button type="button" class="btn small secondary export-btn" id="g-export"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14" /></svg>Exportar ${esc(monthName(mk))} (CSV)</button>` : ''}
    ${places.length ? `<h3 class="section-title">Por tipo de gasto</h3><ul class="place-bars">${places
      .map(
        ([id, c]) =>
          `<li><span>${esc(PLACE_LABEL[id] || 'Sin especificar')}</span><b>${esc(formatMoney(c))}</b><span class="track"><span class="fill" style="width:${((c / maxPlace) * 100).toFixed(1)}%"></span></span></li>`,
      )
      .join('')}</ul>` : ''}
    <h3 class="section-title">Compras</h3>
    ${t.purchases.length ? `<ul class="prods">${t.purchases
      .map(
        (p) => `<li><button type="button" class="purchase-row" data-id="${esc(p.id)}">
        <span class="row-title">${esc(dayLabel(p.day))} · ${esc(p.placeName || PLACE_LABEL[p.place] || 'Sin especificar')}</span>
        <span class="row-amount">${esc(formatMoney(p.total))}</span>
        <span class="row-sub">${esc([p.placeName ? PLACE_LABEL[p.place] || 'Sin tipo' : '', timeRange(p), plural(p.items.length, 'artículo', 'artículos'), p.auto ? 'guardada sola' : ''].filter(Boolean).join(' · '))}</span>
      </button></li>`,
      )
      .join('')}</ul>` : '<p class="muted">No hay compras guardadas este mes.</p>'}`;
  for (const b of gBody.querySelectorAll('.purchase-row')) b.onclick = () => {
    gv = { ...gv, mode: 'purchase', id: b.dataset.id };
    renderGastos();
  };
  const ex = $('#g-export');
  if (ex) ex.onclick = () => exportMonth(mk);
}

function renderPurchase() {
  const p = ledger.purchases.find((x) => x.id === gv.id);
  $('#gastos-back').hidden = false;
  $('#gastos-title').textContent = `Compra del ${dayLabel(p.day)}`;
  const units = p.items.reduce((sum, it) => sum + it.qty, 0);
  gBody.innerHTML = `
    <div class="big-total">${esc(formatMoney(p.total))}</div>
    <p class="sub-line">${esc([cap(dayLabel(p.day)) + ' ' + p.day.slice(0, 4), timeRange(p), plural(p.items.length, 'artículo', 'artículos'), plural(units, 'unidad', 'unidades')].filter(Boolean).join(' · '))}</p>
    <label class="field">
      <span class="field-label">Lugar</span>
      <input id="g-place-name" class="input" type="text" list="known-places" autocomplete="off" autocapitalize="words" maxlength="60" placeholder="Ej.: Coto Palermo" value="${esc(p.placeName)}" />
    </label>
    <h3 class="section-title">Tipo de gasto</h3>
    <div class="chips place-chips" id="g-places" role="radiogroup" aria-label="Tipo de gasto">${placeChips(p.place)}</div>
    <h3 class="section-title">Artículos</h3>
    <ul class="p-items">${p.items
      .map(
        (it) => `<li><span class="n">${it.name ? esc(it.name) : 'Artículo sin nombre'}</span><span class="q">${it.qty} × ${esc(formatMoney(it.cents))}</span><span class="s">${esc(formatMoney(it.cents * it.qty))}</span></li>`,
      )
      .join('')}</ul>
    <div class="danger-zone"><button type="button" class="btn danger-ghost" id="g-del">Borrar compra</button></div>`;
  fillKnownPlaces();
  const nameInput = $('#g-place-name');
  const saveName = () => {
    const cur = ledger.purchases.find((x) => x.id === p.id);
    if (!cur || cur.placeName === nameInput.value.replace(/\s+/g, ' ').trim()) return;
    ledger = setPlaceName(ledger, p.id, nameInput.value);
    // Si el lugar ya se usó antes y la compra no tiene tipo, se lo ponemos
    const t = placeTypeFor(ledger, nameInput.value);
    if (t && !cur.place) ledger = setPlace(ledger, p.id, t);
    saveLedger();
    const chips = $('#g-places');
    if (chips) chips.innerHTML = placeChips(ledger.purchases.find((x) => x.id === p.id).place);
  };
  nameInput.addEventListener('change', saveName);
  nameInput.addEventListener('blur', saveName);
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') nameInput.blur();
  });
  $('#g-places').onclick = (e) => {
    const b = e.target.closest('[data-place]');
    if (!b) return;
    saveName();
    const cur = ledger.purchases.find((x) => x.id === p.id);
    ledger = setPlace(ledger, p.id, cur.place === b.dataset.place ? '' : b.dataset.place);
    saveLedger();
    renderGastos();
  };
  $('#g-del').onclick = () => {
    const before = ledger;
    ledger = deletePurchase(ledger, p.id);
    saveLedger();
    gv = { ...gv, mode: 'month', id: null };
    renderGastos();
    renderCloseCard();
    render();
    wasOver = overFlags(budget());
    toast(`Borraste la compra de ${formatMoney(p.total)}`, {
      action: 'Deshacer',
      onAction: () => {
        ledger = before;
        saveLedger();
        renderCloseCard();
        render();
        wasOver = overFlags(budget());
        if (sheetGastos.open) {
          gv = { ...gv, mode: 'purchase', id: p.id };
          renderGastos();
        }
      },
    });
  };
}

// Exportar el mes como CSV: en el APK abre «Compartir» de Android (para mandarlo a otra app);
// en el navegador lo comparte si se puede o lo descarga.
async function exportMonth(mk) {
  const csv = monthCSV(ledger, mk);
  const name = `compras-${mk}.csv`;
  const title = `Compras de ${monthLabel(mk)}`;
  const P = window.Capacitor?.Plugins;
  if (isNative && P?.Filesystem && P?.Share) {
    try {
      const res = await P.Filesystem.writeFile({ path: name, data: csv, directory: 'CACHE', encoding: 'utf8' });
      await P.Share.share({ title, dialogTitle: 'Enviar el archivo a…', files: [res.uri] });
    } catch (err) {
      if (!/cancel/i.test(String(err?.message || err))) {
        console.error(err);
        toast('No se pudo compartir el archivo.', { tone: 'bad' });
      }
    }
    return;
  }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  try {
    const file = new File([blob], name, { type: 'text/csv' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return;
    }
  } catch (err) {
    if (err?.name === 'AbortError') return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`Descargaste ${name}`);
}

// ---------- Arranque ----------
render();

// Si la página vuelve de la caché atrás/adelante, de segundo plano u otra pestaña cambió los datos,
// releemos localStorage: así nunca escribimos encima con un estado viejo en memoria.
function reloadState() {
  list = loadJSON(LIST_KEY, sanitizeList, emptyList);
  hist = loadJSON(HIST_KEY, sanitizeStore, emptyStore);
  ledger = loadJSON(LEDGER_KEY, sanitizeLedger, emptyLedger);
  wasOver = overFlags(budget());
  render();
  renderCloseCard();
  if (el.sheetHistory.open) renderHistory();
  if (sheetGastos.open) renderGastos();
  if (sheetRecap.open) renderRecap();
}
window.addEventListener('pageshow', (e) => {
  if (e.persisted) reloadState();
});
window.addEventListener('storage', (e) => {
  if (e.key === LIST_KEY || e.key === HIST_KEY || e.key === LEDGER_KEY) reloadState();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    reloadState();
    rollover();
  }
});
rollover();
// Si la app queda abierta pasada la medianoche
setInterval(() => {
  if (document.visibilityState === 'visible') rollover();
}, 60_000);

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
  get ledger() {
    return ledger;
  },
};
