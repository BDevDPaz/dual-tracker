# Sistema visual

Reglas de ritmo, tipo, áreas seguras y teclado de Dual Tracker. El teléfono de referencia del dueño es un Samsung Galaxy S22+ (Android, navegación por gestos o tres botones). La interfaz no está medida para ese aparato: lee el ancho, el alto y la escala de fuente del sistema.

Los números de espaciado, radio, tipo y `size={}` viven en `src/constants/theme.ts` (`TOKENS`, `FONT`, `ICON`). ESLint (`no-restricted-syntax`) y `src/constants/uiLiterals.ts` fallan si aparece un literal nuevo en `app/`, `src/components/` o `src/context/`. El `0` está permitido. Los anchos y altos puntuales (por ejemplo `flex: 1` o un `maxWidth` en porcentaje) no entran en esa regla.

## Escala

| Token | dp |
| --- | --- |
| `spacing.xxs` … `4xl` | 2, 4, 8, 12, 16, 24, 32, 48, 64 |
| `radius.hairline` … `round` | 2, 4, 8, 12, 16, 24, 32, 9999 |
| `layout.screenPadding` / `screenPaddingCompact` | 24 / 16 |
| `layout.minTouchTarget` | 48 |
| `layout.buttonMd` / `buttonLg` | 56 / 64 |
| `layout.inputMin` | 48 |
| `layout.textArea` / `textAreaLg` | 96 / 128 |
| `layout.readableMax` | 720 |
| `layout.sheetMaxRatio` | 0.9 de la ventana |
| `layout.hairline` | 1 |
| `ICON` | 12, 16, 18, 20, 24, 28, 48 |

`FONT` va de `micro` (12) a `metric` (36). Horas e importes usan `figure`, `metric` o `tabularNums` (cifras de ancho fijo). El papel del comprobante (`paper*`) es documento, no cromo de la app.

Elevación: `TOKENS.shadows` `none | sm | md | lg` (incluye `elevation` de Android).

## Primitivas

`src/components/ui/`

| Nombre | También |
| --- | --- |
| `ScreenContainer` | `Screen` |
| `ScreenScroll` | scroll, teclado y ancho de lectura |
| `PageHeader` | `Header` |
| `Section`, `Card`, `Row`, `Chip` | |
| `Button` | altura mínima, el texto puede partirse |
| `Input` | `FormField` |
| `ModalShell` | `ModalSheet` |
| `EmptyState` | |

`SAFE_EDGES.all` en pantallas sueltas. `SAFE_EDGES.tab` en Hoy, Historial, Reportes y Ajustes (la barra de pestañas ya cubre la navegación del sistema). `SAFE_EDGES.stack` cuando el header nativo cubre la barra de estado. El alta usa un `SafeAreaView` propio; el perfil entra con `SAFE_EDGES.none` para no sumar el inset dos veces.

## Anchos

`useResponsive()` (`useWindowDimensions`):

| Nombre | Ancho |
| --- | --- |
| compact | &lt; 360 |
| regular | 360–599 (el S22+ cae aquí) |
| expanded | 600–839, o apaisado a partir de 600 |
| tablet | ≥ 840 |

- Compact: padding 16. El resto, 24.
- Tablet, o expanded en horizontal: la columna se centra a 720 dp.
- Compact en vertical: las dos columnas de la bienvenida y los CTAs del hero se apilan.
- `app.json` permite girar (`orientation: "default"`). Android usa `edgeToEdgeEnabled` y `softwareKeyboardLayoutMode: "resize"`.

## Fuente del sistema

No hay `maxFontSizeMultiplier` global. Botones, chips y filas crecen (`minHeight` 48) y el texto parte línea. La única excepción es la cifra grande del hero (temporizador e importe): una línea, `adjustsFontSizeToFit`, escala mínima 0.6. En compact esa cifra usa `FONT.metricCompact`.

Las cadenas en español son más largas que en inglés. Títulos de hoja y de cabecera bajan un peldaño en compact. Las etiquetas de `KeyValueRow` ocupan el espacio que sobra y el valor (tabular) no pasa del 48 % del ancho. Los chips no cortan el texto.

## Teclado

No se añadió `react-native-keyboard-controller`: es un módulo nativo y esta entrega no genera un APK. Hace falta un cliente nuevo para que ese paquete exista en el teléfono. La solución actual es JavaScript y vale en el binario que ya está instalado.

- iOS: `automaticallyAdjustKeyboardInsets` en el `ScrollView` y `KeyboardAvoidingView` con `behavior="padding"` en las hojas.
- Android: `useKeyboardInset()` resta lo que la ventana ya encogió (`resize`) para no dejar un hueco doble. Con borde a borde la ventana a menudo no encoge; en ese caso el gancho añade el alto del teclado.
- El campo enfocado se desplaza (`scrollFieldIntoView`).
- Tocar fuera o arrastrar cierra el teclado (`keyboardShouldPersistTaps="handled"`, `keyboardDismissMode`).
- Toda hoja (`ModalShell`) lleva `KeyboardAvoidingView`, scroll interno y `maxHeight` del 90 %.

`useFormFocusChain` + `FORM_FIELDS` es el único orden de foco:

- Un campo de una línea que no es el último de una línea: `returnKeyType="next"` y enfoca el siguiente (aunque sea multilínea).
- El último de una línea: `done` (o `search` en el buscador de destinos). Cierra el teclado y, si `canSubmit` no es `false`, guarda.
- Multilínea: Enter inserta un salto (`blurOnSubmit` false). No guarda.
- PIN: `secureTextEntry`, teclado numérico. Email, decimales, enteros y HH:mm llevan el teclado que corresponde. La máscara `HH:mm` fuerza el teclado numérico aunque la cadena hubiera puesto otro.

Formularios: editar sesión, inicio de almuerzo, alta del día, nota, perfil de alta, perfil / PIN / admin / calendario de Ajustes, alta y radio de destino, búsqueda de destinos, nota de Olvidé fichar, nota de conflicto, PIN de salud. Exportar el diagnóstico de Soporte es un botón, no un formulario.

## Checklist de teléfono

Probar en español y en inglés. Fuente del sistema en 1.0, 1.3 y 2.0 (Ajustes → Pantalla → Tamaño de fuente).

- **V1.** Teléfono estrecho (~320–359 dp, vertical). El padding lateral es 16. Los CTAs del hero y las columnas de bienvenida van uno bajo el otro. Nada se sale por la derecha.
- **V2.** Galaxy S22+ u otro teléfono normal (360–430 dp). Padding 24. CTAs del hero en fila. La barra de pestañas queda por encima de la barra de gestos y de la de tres botones.
- **V3.** Plegable abierto o tablet (≥ 600 / ≥ 840). La columna no se estira de borde a borde (máximo 720 en tablet, y en plegable apaisado).
- **V4.** Horizontal (girar el teléfono). El contenido hace scroll. La barra de estado y la de navegación no tapan títulos ni botones.
- **V5.** Fuente 1.0. Jerarquía de títulos, cuerpo y etiquetas estable. Horas e importes no cambian de ancho al pasar el tiempo.
- **V6.** Fuente 1.3. Botones y chips crecen. El español largo parte línea en chips, filas de historial, avisos y títulos de hoja. No hay texto cortado con puntos suspensivos salvo el temporizador del hero.
- **V7.** Fuente 2.0. Cada pantalla hace scroll hasta el último botón. Las hojas no superan el 90 % de la altura y su interior se desplaza. El temporizador del hero se encoge en lugar de partirse en dos líneas.
- **V8.** Navegación por gestos. El contenido y el pie (Guardar, Editar) quedan por encima del gesto. El toast queda debajo de la barra de estado.
- **V9.** Navegación de tres botones. El mismo criterio que V8: ni el pie ni la barra de pestañas quedan debajo de los botones del sistema.
- **V10.** Hoy: hero, resumen, destinos visitados (chips), avisos de Soporte. Vacío, jornada activa y salida pendiente.
- **V11.** Historial: semana, filtros en chips, cifras de horas e importe alineadas. Fila larga en español.
- **V12.** Reportes y estado de nómina (`report/[periodId]`): periodo, líneas, vista previa. El paquete (`report/pack`) muestra el hash sin recortar el botón de compartir.
- **V13.** Detalle de jornada, editar, nota y eliminar. Rastro: capas en chips y lista que hace scroll.
- **V14.** Destinos: búsqueda, ficha, radio y alta. Alta del día (modal) con dirección de dos líneas.
- **V15.** Alta: bienvenida, descargo (casilla de 48 dp), permisos y perfil. El progreso no queda bajo la barra de estado.
- **V16.** Ajustes: perfil, PIN, calendario y zona admin (tras desbloquear). Pie Guardar por encima del teclado.
- **V17.** Soporte: índice, guía y práctica (Olvidé fichar). La guía hace scroll con fuente grande. El consejo en pantalla no tapa el título.
- **V18.** Salud y conflicto. El PIN de salud y la nota de conflicto siguen la cadena de foco.
- **V19.** Legal (descargo y retención) y pantalla de arranque. El spinner y el reintento respetan las áreas seguras.
- **V20.** Teclado, en este orden, con el campo visible y el botón de retorno correcto:
  1. Editar sesión: inicio `next`, fin `done` (guarda si es válido), nota = salto de línea.
  2. Almuerzo: hora `done`.
  3. Alta del día: dirección `next`, alias `next`, cliente `done`.
  4. Nota de jornada y nota de conflicto: Enter no guarda.
  5. Perfil de alta: nombre `next`, tarifa `next`, recordatorio `done`.
  6. Ajustes perfil: nombre `next`, recordatorio `done`.
  7. PIN de Ajustes y PIN de salud: `done`, oculto, numérico.
  8. Admin: tarifa `next`, multiplicador `next`, empleador `next`, email `next`, retención `next`, radio `done`.
  9. Calendario: hora `done`.
  10. Alta de destino: alias `next`, dirección `next`, cliente `next`, notas = salto, radio `done`.
  11. Radio de un destino: `done`.
  12. Búsqueda de destinos: `search`, no guarda.
  13. Olvidé fichar (nota de práctica): `done` y guarda si es válido.
  14. Repetir con la hoja abierta (editar, nota, alta del día, almuerzo): el campo sigue visible.
