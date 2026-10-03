// Lectura de precios con tesseract.js, 100 % local (worker, core e idioma en www/ocr/).
import { drawScaled, grayStretch } from './imageutil.js';
import { priceFromWords } from './priceparser.js';

export const SCALES = [1200, 700, 400];

let workerPromise = null;
let progressCb = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.dataset.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(s);
  });
}

// Mismo test que usa wasm-feature-detect para SIMD.
function simdSupported() {
  try {
    return WebAssembly.validate(
      new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]),
    );
  } catch {
    return false;
  }
}

async function createWorker(core) {
  const base = new URL('ocr/', document.baseURI).href;
  const worker = await self.Tesseract.createWorker('spa', 1 /* OEM.LSTM_ONLY */, {
    workerPath: `${base}worker.min.js`,
    corePath: `${base}${core}`,
    langPath: base.replace(/\/$/, ''),
    gzip: true,
    workerBlobURL: false,
    cacheMethod: 'none',
    logger: (m) => progressCb && progressCb(m),
    errorHandler: () => {},
  });
  await worker.setParameters({ tessedit_pageseg_mode: '11', user_defined_dpi: '300' });
  return worker;
}

export function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      await loadScript('ocr/tesseract.min.js');
      const cores = simdSupported()
        ? ['tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js']
        : ['tesseract-core-lstm.wasm.js'];
      let lastErr;
      for (const core of cores) {
        try {
          return await createWorker(core);
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

function flattenWords(blocks) {
  const words = [];
  for (const b of blocks || []) {
    for (const p of b.paragraphs || []) {
      for (const l of p.lines || []) {
        for (const w of l.words || []) words.push({ text: w.text, bbox: w.bbox, confidence: w.confidence });
      }
    }
  }
  return words;
}

// Lee el precio de una imagen (ImageBitmap/HTMLImageElement). onStep(texto) informa el avance.
export async function readPrice(src, onStep = () => {}) {
  progressCb = (m) => {
    if (m.status === 'loading language traineddata' || m.status === 'loading tesseract core') onStep('Preparando el lector…');
  };
  onStep('Preparando el lector…');
  const worker = await getWorker();
  const canvases = SCALES.map((side) => {
    const { canvas, scale } = drawScaled(src, side);
    grayStretch(canvas);
    return { canvas, scale };
  });
  const pass = async (label) => {
    const readings = [];
    for (let i = 0; i < canvases.length; i++) {
      onStep(`${label} (${i + 1} de ${canvases.length})…`);
      const { data } = await worker.recognize(canvases[i].canvas, {}, { blocks: true, text: false });
      readings.push({ words: flattenWords(data.blocks), scale: canvases[i].scale });
    }
    return readings;
  };
  // PSM 11 (texto disperso) es la lectura principal. En carteles donde el precio enorme domina
  // y hay poco texto chico, Tesseract a veces no segmenta nada con PSM 11: ahí reintentamos con
  // PSM 6 (un bloque de texto), que en las pruebas sí lo lee.
  let readings = await pass('Leyendo el cartel');
  let result = priceFromWords(readings);
  result.psm = 11;
  if (!result.candidates.length) {
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
    try {
      readings = await pass('Probando otra lectura');
      const second = priceFromWords(readings);
      if (second.candidates.length) {
        result = second;
        result.psm = 6;
      }
    } finally {
      await worker.setParameters({ tessedit_pageseg_mode: '11' });
    }
  }
  result.readings = readings;
  return result;
}
