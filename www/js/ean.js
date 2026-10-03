// Validación de códigos EAN-13 / EAN-8 / UPC-A (dígito verificador).

export function checkDigitOk(code) {
  if (!/^\d+$/.test(code) || ![8, 12, 13].includes(code.length)) return false;
  const digits = code.split('').map(Number);
  const check = digits.pop();
  let sum = 0;
  // Desde la derecha: pesos 3,1,3,1…
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += digits[i] * w;
  return (10 - (sum % 10)) % 10 === check;
}

// UPC-A (12) se guarda como EAN-13 con un 0 adelante, para que sea una sola clave.
export function normalizeCode(code) {
  const c = String(code || '').replace(/\D/g, '');
  if (!checkDigitOk(c)) return null;
  return c.length === 12 ? `0${c}` : c;
}
