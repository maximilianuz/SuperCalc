// localStorage con lectura defensiva: si falla o hay datos corruptos, se usa el valor por defecto.

export function loadJSON(key, sanitize, fallback) {
  let raw = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return fallback();
  }
  if (raw == null) return fallback();
  try {
    return sanitize(JSON.parse(raw));
  } catch {
    try {
      localStorage.setItem(`${key}.corrupto`, raw);
    } catch {}
    return fallback();
  }
}

export function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
