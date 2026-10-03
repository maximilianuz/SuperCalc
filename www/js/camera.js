// Cámara en vivo dentro de la app (getUserMedia). Si no está disponible o no hay permiso,
// la app usa la cámara del sistema (input file con capture).
import { makeCanvas } from './imageutil.js';

export function cameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export async function startCamera(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
  return stream;
}

export function stopCamera(stream, video) {
  for (const t of stream?.getTracks?.() || []) t.stop();
  if (video) video.srcObject = null;
}

// Copia el cuadro actual a un canvas con el lado mayor ≤ longSide.
export function grabFrame(video, longSide = 1920) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const k = Math.min(1, longSide / Math.max(w, h));
  const c = makeCanvas(w * k, h * k);
  c.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, c.width, c.height);
  return c;
}

export function torchSupported(stream) {
  const track = stream?.getVideoTracks?.()[0];
  try {
    return !!track?.getCapabilities?.().torch;
  } catch {
    return false;
  }
}

export async function setTorch(stream, on) {
  const track = stream?.getVideoTracks?.()[0];
  try {
    await track.applyConstraints({ advanced: [{ torch: on }] });
    return true;
  } catch {
    return false;
  }
}

// Mensaje claro según el error de getUserMedia
export function cameraErrorText(err) {
  const n = err && err.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'No hay permiso para usar la cámara. Podés darlo en Ajustes → Apps → Compras → Permisos, o usar la cámara del sistema.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No encontramos una cámara en este dispositivo.';
  if (n === 'NotReadableError') return 'La cámara está ocupada por otra app. Cerrala y probá de nuevo.';
  return 'No se pudo abrir la cámara.';
}
