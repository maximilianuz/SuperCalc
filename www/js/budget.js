// Límite de gasto por día, semana o mes. Módulo puro (sin DOM ni storage), se prueba en Node.
// Cuenta lo guardado en Gastos más el carrito actual (que siempre es de hoy: lo de días
// anteriores se guarda solo). Con semana o mes, sugiere cuánto gastar por día para llegar.
import { dayKey } from './ledger.js';

export const PERIODS = ['day', 'week', 'month'];
export const PERIOD_LABEL = { day: 'Por día', week: 'Por semana', month: 'Por mes' };

// Semana de lunes a domingo; mes calendario. Fechas locales con setDate (no se corren por horario de verano).
export function periodRange(period, now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const start = new Date(d);
  const end = new Date(d);
  if (period === 'week') {
    start.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
  } else if (period === 'month') {
    start.setDate(1);
    end.setMonth(d.getMonth() + 1, 0);
  }
  const daysLeft = Math.round((end - d) / 86_400_000) + 1;
  return { start: dayKey(start), end: dayKey(end), today: dayKey(d), daysLeft };
}

export function budgetState({ limit, period }, ledger, cartCents, now = Date.now()) {
  if (!limit) return null;
  const r = periodRange(period, now);
  let savedToday = 0;
  let spentBefore = 0;
  for (const p of ledger.purchases) {
    if (p.day === r.today) savedToday += p.total;
    else if (p.day >= r.start && p.day < r.today) spentBefore += p.total;
  }
  const spentToday = savedToday + cartCents;
  // La sugerencia no cambia durante el día: se calcula con lo gastado antes de hoy. Redondeada a pesos enteros.
  const daily = period === 'day' ? limit : Math.floor(Math.max(limit - spentBefore, 0) / r.daysLeft / 100) * 100;
  const periodSpent = spentBefore + spentToday;
  return {
    limit,
    period,
    daily,
    savedToday,
    spentToday,
    remaining: Math.max(daily - spentToday, 0),
    excess: Math.max(spentToday - daily, 0),
    over: spentToday > daily,
    periodSpent,
    periodRemaining: Math.max(limit - periodSpent, 0),
    periodOver: periodSpent > limit,
    daysLeft: r.daysLeft,
  };
}
