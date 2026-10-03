# Compras

App personal de Android para calcular cuánto gastás en el súper mientras agregás artículos.
Funciona **sin internet**: la fuente, el lector de precios (OCR) y el lector de códigos van dentro de la app.

## Instalar en el celular (todo desde el teléfono)

### 1. Generar el APK en GitHub
1. Abrí el repositorio en GitHub desde el navegador del celular (si ves la versión móvil, podés pedir «Ver versión de escritorio» si algún botón no aparece).
2. Entrá a la pestaña **Actions**.
3. A la izquierda (o en el menú «All workflows») elegí **Generar APK**.
4. Tocá **Run workflow** → elegí la rama → **Run workflow**.
5. Esperá a que el círculo amarillo pase a ✓ verde (tarda unos 5–10 minutos). El workflow también corre solo cada vez que se sube código al repositorio.

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
   Si lo rechazaste, la app te ofrece usar la cámara del sistema; para volver a habilitarlo: Ajustes → Apps → Compras → Permisos → Cámara.

### Actualizar
Repetí los pasos 1, 2 y 4. Todos los APK se firman con la misma clave (`signing/debug.keystore`), así que el nuevo se instala **encima** del anterior y conservás la lista, el historial de precios y los gastos.

## Qué hace
- Lista con nombre opcional, precio y cantidad (− / +). Arriba, fijo: el total o, si pusiste un límite,
  **cuánto te queda hoy** en grande (el carrito queda abajo).
  Mismo nombre (o código) y mismo precio → suma cantidad. Quitar con «Deshacer». «Vaciar» con confirmación.
- Límite de gasto **por día, por semana o por mes**, con barra y marca; avisa (vibración + aviso) al pasarte
  y sigue sumando. Cuenta lo que ya guardaste en Gastos más el carrito: terminar una compra no lo reinicia.
  Con semana (lunes a domingo) o mes, sugiere **cuánto gastar hoy** para llegar: lo que queda del período
  repartido en los días que faltan (incluido hoy), sin contar lo de hoy para que la cifra no cambie mientras
  comprás. Pasarte de lo sugerido avisa; pasarte del período también, y se marca en rojo.
- **Escanear (escaneo continuo)**: la cámara queda abierta y arriba ves el total. Cuando lee un código de barras
  aparece una tarjeta: si ya lo compraste, con el último precio y **Añadir** (un toque); si es nuevo, **Leer precio**
  lee el cartel. El disparador lee el precio de un cartel sin código. **Escribir** pasa lo leído a la hoja de siempre.
  Después de añadir, la cámara sigue lista para el próximo producto (con «Deshacer»).
  Botón **Galería** para elegir una foto guardada. Si no hay permiso de cámara, usa la cámara del sistema.
- **Foto del precio**: lee el cartel y te propone precios para tocar. Nunca agrega nada sin que confirmes.
  Detecta precios que no son el final (mayorista, promo, cuotas, por kg, sin impuestos, precio anterior)
  y los marca «A confirmar» (esos no entran al historial hasta que confirmes que son el precio final).
- **Código**: lee EAN-13 / EAN-8 / UPC-A de una foto (también de la misma foto del precio).
- **Historial de precios** por producto, con gráfico, subas/bajas, actualizar y borrar con «Deshacer».
- **Terminar compra**: guarda la lista en **Gastos** con el **lugar**: los que más usás aparecen primero y se eligen
  con un toque (con su tipo); «Otro lugar» para escribir uno nuevo (por ejemplo «Coto Palermo»,
  con autocompletado) y el **tipo de gasto** (Supermercado, Almacén/minimercado, Kiosco,
  Verdulería/carnicería u Otro). Si escribís un lugar que ya usaste, el tipo se elige solo. Las dos cosas se pueden
  editar después desde Gastos → mes → compra. «Vaciar» en cambio descarta sin guardar.
- **Día de compra automático**: cada artículo guarda la hora en que lo agregaste. Si entre dos artículos pasan
  más de 2 horas se toman como compras distintas (súper a la mañana, kiosco a la tarde). Si abrís la app otro día
  con artículos de un día anterior, esa compra se guarda sola en Gastos con su fecha (con «Deshacer»).
- **Cierre mensual**: al cambiar el mes, el anterior se cierra y aparece un aviso. **Ver resumen** abre el cierre:
  total, variación contra el mes previo, promedio por compra, gasto por lugar, el producto que más subió y
  **Exportar CSV**.
- **Gastos (historial anual)**: total del año, promedio por mes, barras por mes, detalle de cada mes por lugar
  y por compra (artículos, cambiar el lugar, borrar con «Deshacer»).

## Exportar el mes (para otra app de gastos)
En **Gastos → mes → «Exportar … (CSV)»** (o en el resumen de cierre de mes → «Exportar CSV»).
En el celular se abre **Compartir** de Android para mandar el archivo directo a la otra app (o guardarlo en Drive,
mandarlo por mail, etc.). El archivo se llama `compras-AAAA-MM.csv` y tiene **una fila por compra**:

| Columna | Ejemplo | Notas |
|---|---|---|
| Fecha | `2026-09-06` | AAAA-MM-DD |
| Hora | `10:05` | hora del primer artículo |
| Lugar | `Coto Palermo` | lo que escribiste |
| Tipo de gasto | `Supermercado` | o `Sin especificar` |
| Monto | `5350.00` | punto decimal, sin separador de miles |
| Moneda | `ARS` | |
| Artículos | `2` | unidades |
| Detalle | `Yerba x1; Leche x1` | |

Separador coma, codificación UTF-8 (con BOM, para que Excel muestre bien los acentos). Si la otra app pide otro
formato (punto y coma, coma decimal, nombres de columna fijos), se puede adaptar.

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
