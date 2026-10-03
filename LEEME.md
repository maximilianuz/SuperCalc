# Compras

App personal de Android para calcular cuánto gastás en el súper mientras agregás artículos.
Funciona **sin internet**: la fuente, el lector de precios (OCR) y el lector de códigos van dentro de la app.

## Instalar en el celular (todo desde el teléfono)

### 1. Generar el APK en GitHub
1. Abrí el repositorio en GitHub desde el navegador del celular (si ves la versión móvil, podés pedir «Ver versión de escritorio» si algún botón no aparece).
2. Entrá a la pestaña **Actions**.
3. A la izquierda (o en el menú «All workflows») elegí **Generar APK**.
4. Tocá **Run workflow** → elegí la rama → **Run workflow**.
5. Esperá a que el círculo amarillo pase a ✓ verde (tarda unos 5–10 minutos). El workflow también corre solo cuando se sube código a `main`.

### 2. Descargar el APK
1. Tocá la ejecución terminada (la del ✓ verde).
2. Abajo, en **Artifacts**, tocá **Compras-apk-N**. Se descarga un `.zip`.
3. Abrí el `.zip` con la app **Archivos** y extraé `Compras-N.apk`.

> Tenés que estar con la sesión iniciada en GitHub para poder descargar artefactos. Se guardan 30 días.

### 3. Permitir instalar apps desconocidas
La primera vez Android te va a frenar. Cuando aparezca el aviso:
1. Tocá **Configuración**.
2. Activá **Permitir de esta fuente** para la app desde la que abriste el APK (Archivos o Chrome).
3. Volvé atrás.

(Ruta manual, varía según la marca: Ajustes → Apps → Acceso especial → Instalar apps desconocidas.)

### 4. Instalar
1. Tocá el archivo `Compras-N.apk` → **Instalar**.
2. Si Play Protect avisa que la app es desconocida, elegí **Instalar de todas formas** (es tu propia app, firmada con una clave de depuración).
3. Abrila. La primera vez que uses **Foto del precio** o **Código**, Android te va a pedir permiso de **cámara**: aceptalo.

### Actualizar
Repetí los pasos 1, 2 y 4. Todos los APK se firman con la misma clave (`signing/debug.keystore`), así que el nuevo se instala **encima** del anterior y conservás la lista y el historial de precios.

## Qué hace
- Lista con nombre opcional, precio unitario y cantidad (− / +). Total grande y fijo arriba.
  Mismo nombre (o código) y mismo precio → suma cantidad. Quitar con «Deshacer». «Vaciar» con confirmación.
- Límite de gasto con barra y marca; avisa (vibración + aviso) al pasarte y sigue sumando.
- **Foto del precio**: lee el cartel y te propone precios para tocar. Nunca agrega nada sin que confirmes.
  Detecta precios que no son el final (mayorista, promo, cuotas, por kg, sin impuestos, precio anterior)
  y los marca «A confirmar» (esos no entran al historial hasta que confirmes que son el precio final).
- **Código**: lee EAN-13 / EAN-8 / UPC-A de una foto (también de la misma foto del precio).
- **Historial de precios** por producto, con gráfico, subas/bajas, actualizar y borrar con «Deshacer».

## Para desarrollo (computadora)
```bash
npm ci
npm run serve          # http://localhost:4173
npm test               # pruebas unitarias (Node)
npm run test:e2e       # pruebas end-to-end (Playwright + Chromium, red cortada)
npm run vendor         # vuelve a copiar fuente/OCR/zxing desde node_modules a www/
npm run icons          # regenera íconos y pantalla de inicio (usa Chromium)
npm run android:prepare  # cap add/sync android + cámara + íconos + firma fija
npm run android:build    # además compila el APK (necesita Android SDK y JDK 21)
```

Estructura: `www/` es la app (HTML/CSS/JS sin build). `www/js/priceparser.js` y `www/js/history.js`
son lógica pura probada en Node. `scripts/` tiene las herramientas, `tests/` las pruebas,
`docs/capturas/` capturas a 412/360 px en claro y oscuro.
