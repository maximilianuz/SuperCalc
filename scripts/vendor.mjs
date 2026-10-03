// Copia a www/ los recursos que la app usa sin internet:
// fuente Geist, tesseract.js (worker + cores + idioma español) y zxing.
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = (p) => join(root, 'node_modules', p);
const www = (p) => join(root, 'www', p);

const files = [
  [nm('geist/dist/fonts/geist-sans/Geist-Variable.woff2'), www('fonts/Geist-Variable.woff2')],
  [nm('tesseract.js/dist/tesseract.min.js'), www('ocr/tesseract.min.js')],
  [nm('tesseract.js/dist/worker.min.js'), www('ocr/worker.min.js')],
  [nm('tesseract.js-core/tesseract-core-simd-lstm.wasm.js'), www('ocr/tesseract-core-simd-lstm.wasm.js')],
  [nm('tesseract.js-core/tesseract-core-lstm.wasm.js'), www('ocr/tesseract-core-lstm.wasm.js')],
  [nm('@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz'), www('ocr/spa.traineddata.gz')],
  [nm('@zxing/library/umd/index.min.js'), www('vendor/zxing.min.js')],
];

for (const [from, to] of files) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`${(statSync(to).size / 1024).toFixed(0).padStart(6)} KB  ${to.slice(root.length + 1)}`);
}
