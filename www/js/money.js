// Dinero siempre en centavos enteros. Formato argentino: «$ 1.299,50».

export function formatMoney(cents) {
  const n = Math.round(Number(cents) || 0);
  const neg = n < 0;
  const abs = Math.abs(n);
  const pesos = Math.floor(abs / 100);
  const cent = abs % 100;
  const miles = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '−' : ''}$ ${miles},${String(cent).padStart(2, '0')}`;
}

// Sin centavos cuando son ,00 (para etiquetas compactas).
export function formatMoneyShort(cents) {
  const s = formatMoney(cents);
  return s.endsWith(',00') ? s.slice(0, -3) : s;
}

// Interpreta lo que la persona escribe: «1299», «1.299,50», «1299,5», «1299.50».
// Devuelve centavos o null si no es un monto válido.
export function parseMoneyInput(text) {
  if (text == null) return null;
  let s = String(text).trim().replace(/^\$\s*/, '').replace(/\s+/g, '');
  if (!s) return null;
  if (!/^\d[\d.,]*$/.test(s)) return null;
  let intPart = s;
  let decPart = '';
  const lastComma = s.lastIndexOf(',');
  if (lastComma >= 0) {
    intPart = s.slice(0, lastComma);
    decPart = s.slice(lastComma + 1);
    if (intPart.includes(',')) return null;
  } else {
    const lastDot = s.lastIndexOf('.');
    if (lastDot >= 0) {
      const after = s.slice(lastDot + 1);
      if (after.length > 0 && after.length <= 2) {
        intPart = s.slice(0, lastDot);
        decPart = after;
      }
    }
  }
  if (decPart.length > 2 || /\D/.test(decPart)) return null;
  // Puntos restantes: separadores de miles («1.299»)
  if (intPart.includes('.')) {
    if (!/^\d{1,3}(\.\d{3})+$/.test(intPart)) return null;
    intPart = intPart.replace(/\./g, '');
  }
  if (intPart === '') intPart = '0';
  if (!/^\d+$/.test(intPart)) return null;
  const cents = Number(intPart) * 100 + Number((decPart + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return cents;
}

// Para precargar un input de texto: «1299,50» (sin «$» ni miles).
export function centsToInput(cents) {
  if (cents == null) return '';
  const pesos = Math.floor(cents / 100);
  const c = cents % 100;
  return c ? `${pesos},${String(c).padStart(2, '0')}` : String(pesos);
}

export function formatPercent(pct) {
  const abs = Math.abs(pct);
  let r = Math.round(abs * 10) / 10;
  if (r === 0 && abs > 0) r = 0.1;
  return `${r.toFixed(1).replace('.', ',')} %`;
}
