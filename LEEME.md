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
- **Abajo, tres botones con nombre**: **Compra** (el carrito), **Escanear** (en el centro) y **Gastos**.
- **Compra**: arriba, lo ya guardado en el mes (tocalo para ver los gastos) y el botón del **límite**.
  La tarjeta muestra el carrito o, con límite, **cuánto te queda hoy** en grande, con una barra que separa lo ya
  guardado hoy de lo que está en el carrito. Lista con nombre opcional, precio y cantidad (− / +); **Agregar a mano**
  junto al título. Mismo nombre (o código) y mismo precio → suma cantidad. Quitar con «Deshacer». «Vaciar carrito» al final,
  con confirmación.
- Límite de gasto **por día, por semana o por mes**; avisa (vibración + aviso) al pasarte y sigue sumando. Cuenta lo que ya
  guardaste en Gastos más el carrito: guardar una compra no lo reinicia. Con semana (lunes a domingo) o mes, sugiere
  **cuánto gastar hoy**: lo que queda del período repartido en los días que faltan (incluido hoy), sin contar lo de hoy
  para que la cifra no cambie mientras comprás.
- **Guardar compra** (botón fijo sobre la barra de abajo, con el total): elegís con un toque
  - la **fecha**: Hoy, Ayer u Otra fecha (para cargar una compra que te olvidaste);
  - el **lugar**: los que más usás aparecen primero; «Otro» para escribir uno nuevo (con autocompletado);
  - la **categoría**: las que más usás más Supermercado, Almacén, Carnicería, Verdulería, Kiosco y Farmacia.
    **Escribir** abre un campo para crear la tuya (por ejemplo «Mascotas»); queda guardada para la próxima.
    Si elegís un lugar que ya usaste, se elige sola su categoría.
- **Escanear (escaneo continuo)**: la cámara queda abierta y arriba ves el total. Cuando lee un código de barras
  aparece una tarjeta: si ya lo compraste, con el último precio y **Añadir** (un toque); si es nuevo, **Leer precio**
  lee el cartel. El disparador lee el precio de un cartel sin código. **Escribir** pasa lo leído a la hoja de siempre.
  Después de añadir, la cámara sigue lista para el próximo producto (con «Deshacer»).
  Botón **Galería** para elegir una foto guardada. Si no hay permiso de cámara, usa la cámara del sistema.
- **Foto del precio**: lee el cartel y te propone precios para tocar. Nunca agrega nada sin que confirmes.
  Detecta precios que no son el final (mayorista, promo, cuotas, por kg, sin impuestos, precio anterior)
  y los marca «A confirmar» (esos no entran al historial hasta que confirmes que son el precio final).
- **Código**: lee EAN-13 / EAN-8 / UPC-A de una foto (también de la misma foto del precio).
- **Gastos → Por mes**: total del mes con la comparación contra el anterior (‹ › para cambiar de mes), una barra
  **por categoría** y las compras **agrupadas por día con el total de cada día**. Tocá el total para ver el año (barras
  por mes y promedio). Exportar el mes con el botón de arriba a la derecha.
- **Detalle de una compra**: Fecha (conserva la hora), Lugar y Categoría se editan tocándolos; precio y cantidad de cada
  artículo, **Agregar** un artículo que faltó, quitar uno o **Borrar compra** (con «Deshacer»). Los cambios se guardan solos.
- **Gastos → Precios** (historial de precios): por producto, con gráfico, subas/bajas, actualizar y borrar con «Deshacer».
- **Día de compra automático**: cada artículo guarda la hora en que lo agregaste. Si entre dos artículos pasan
  más de 2 horas se toman como compras distintas (súper a la mañana, kiosco a la tarde). Si abrís la app otro día
  con artículos de un día anterior, esa compra se guarda sola en Gastos con su fecha (con «Deshacer»).
- **Cierre mensual**: al cambiar el mes, el anterior se cierra y aparece un aviso. **Ver resumen** abre el cierre:
  total, variación contra el mes previo, promedio por compra, gasto por lugar, el producto que más subió y
  **Exportar CSV**.
- Las compras guardadas con versiones anteriores conservan su tipo como categoría (Supermercado, Almacén, Kiosco,
  Verdulería u Otro).

## Exportar el mes (para otra app de gastos)
En **Gastos → Por mes → botón de exportar (arriba a la derecha)** (o en el resumen de cierre de mes → «Exportar CSV»).
En el celular se abre **Compartir** de Android para mandar el archivo directo a la otra app (o guardarlo en Drive,
mandarlo por mail, etc.). El archivo se llama `compras-AAAA-MM.csv` y tiene **una fila por compra**:

| Columna | Ejemplo | Notas |
|---|---|---|
| Fecha | `2026-09-06` | AAAA-MM-DD |
| Hora | `10:05` | hora del primer artículo |
| Lugar | `Coto Palermo` | lo que escribiste |
| Categoría | `Supermercado` | la que elegiste o escribiste, o `Sin especificar` |
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
