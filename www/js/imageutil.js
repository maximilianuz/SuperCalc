// Utilidades de imagen en canvas (todo local).

export async function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {}
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function dims(src) {
  return { w: src.naturalWidth || src.width, h: src.naturalHeight || src.height };
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// Escala para que el lado mayor mida `longSide`. Devuelve { canvas, scale }.
export function drawScaled(src, longSide, maxUpscale = 2) {
  const { w, h } = dims(src);
  const scale = Math.min(longSide / Math.max(w, h), maxUpscale);
  const canvas = makeCanvas(w * scale, h * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return { canvas, scale: canvas.width / w };
}

// Escala de grises + estiramiento de contraste entre los percentiles 2 y 98.
export function grayStretch(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const n = d.length / 4;
  const gray = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    gray[j] = g;
    hist[gray[j]]++;
  }
  const lo = percentile(hist, n, 0.02);
  let hi = percentile(hist, n, 0.98);
  if (hi <= lo) hi = lo + 1;
  const k = 255 / (hi - lo);
  for (let i = 0, j = 0; j < n; i += 4, j++) {
    const v = (gray[j] - lo) * k;
    gray[j] = v;
    d[i] = d[i + 1] = d[i + 2] = gray[j];
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return gray;
}

function percentile(hist, n, p) {
  const target = n * p;
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= target) return v;
  }
  return 255;
}

export function luminance(canvas) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const n = d.length / 4;
  const out = new Uint8ClampedArray(n);
  for (let i = 0, j = 0; j < n; i += 4, j++) out[j] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
  return out;
}

export function rotate90(canvas) {
  const out = makeCanvas(canvas.height, canvas.width);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.translate(out.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(canvas, 0, 0);
  return out;
}
