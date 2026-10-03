// Lectura de códigos EAN-13 / EAN-8 / UPC-A desde una foto, con @zxing/library local.
import { drawScaled, luminance, rotate90, makeCanvas } from './imageutil.js';
import { normalizeCode } from './ean.js';

let zxingPromise = null;

function loadZXing() {
  if (!zxingPromise) {
    zxingPromise = new Promise((resolve, reject) => {
      if (self.ZXing) return resolve(self.ZXing);
      const s = document.createElement('script');
      s.src = 'vendor/zxing.min.js';
      s.onload = () => resolve(self.ZXing);
      s.onerror = () => {
        zxingPromise = null;
        reject(new Error('No se pudo cargar el lector de códigos'));
      };
      document.head.appendChild(s);
    });
  }
  return zxingPromise;
}

const LONG_SIDES = [1600, 1000, 640, 400];

// Margen blanco alrededor: si la foto se sacó muy cerca, el código queda sin la zona
// silenciosa que zxing necesita a los costados.
function withMargin(canvas) {
  const m = Math.round(Math.max(canvas.width, canvas.height) * 0.06);
  const out = makeCanvas(canvas.width + 2 * m, canvas.height + 2 * m);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, m, m);
  return out;
}

function tryDecode(Z, reader, hints, canvas) {
  const lum = luminance(canvas);
  const source = new Z.RGBLuminanceSource(lum, canvas.width, canvas.height);
  for (const Bin of [Z.HybridBinarizer, Z.GlobalHistogramBinarizer]) {
    try {
      const result = reader.decode(new Z.BinaryBitmap(new Bin(source)), hints);
      const code = normalizeCode(result.getText());
      if (code) return code;
    } catch {
      // NotFoundException / ChecksumException: probar la siguiente combinación
    } finally {
      reader.reset();
    }
  }
  return null;
}

function makeReader(Z, tryHarder) {
  const hints = new Map();
  hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A]);
  if (tryHarder) hints.set(Z.DecodeHintType.TRY_HARDER, true);
  // Lector 1D directo: solo EAN/UPC (MultiFormatReader prueba también QR, Aztec, etc.)
  return { reader: new Z.MultiFormatOneDReader(hints), hints };
}

let quick = null;
// Lectura rápida de un cuadro de la cámara en vivo (una escala, sin girar).
export async function readBarcodeFrame(canvas) {
  const Z = await loadZXing();
  if (!quick) quick = makeReader(Z, false);
  return tryDecode(Z, quick.reader, quick.hints, withMargin(canvas));
}

// Devuelve el código normalizado (EAN-13 u 8 dígitos) o null.
export async function readBarcode(src) {
  const Z = await loadZXing();
  const { reader, hints } = makeReader(Z, true);
  const w = src.naturalWidth || src.width;
  const h = src.naturalHeight || src.height;
  const sides = LONG_SIDES.filter((s, i) => i === 0 || s < Math.max(w, h));
  for (const rotate of [false, true]) {
    for (const side of sides) {
      let { canvas } = drawScaled(src, side, 1);
      if (rotate) canvas = rotate90(canvas);
      canvas = withMargin(canvas);
      const code = tryDecode(Z, reader, hints, canvas);
      if (code) return code;
      // Ceder el hilo para que la interfaz no se congele
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return null;
}
