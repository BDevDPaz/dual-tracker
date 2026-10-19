# Idioma de la interfaz (Español / English)

La app tiene dos idiomas de interfaz: **español** (base) y **inglés**. El selector es uno solo. Está en **Ajustes → Perfil laboral**, en **Soporte** (índice, guías y modo práctica) y en el paso de perfil del alta. Las etiquetas son los endónimos **Español** y **English**.

No hay una tercera opción de «seguir el idioma del teléfono». El idioma del dispositivo solo se usa en el primer arranque, cuando todavía no hay un perfil guardado.

## Una sola fuente

El idioma activo vive en memoria en `src/i18n/index.ts` (`es` | `en`). `useLanguage()` se suscribe con `useSyncExternalStore`: al cambiar, se repinta cada componente suscrito en el mismo instante, también si está dentro de `React.memo`.

Quién se suscribe:

- Cada pantalla que usa `useWorkTracker()` (el gancho llama a `useLanguage()`).
- Las cabeceras de expo-router: cada `_layout` llama a `useLanguage()` y pasa `title: t(...)` a `Stack.Screen` / `Tabs.Screen`.
- Modales, filas, la vista previa del expediente, el aviso (toast), el diálogo de feedback, la pantalla no encontrada y el selector.

`t()` lee el idioma en el momento del render. Un componente que llama a `t()` tiene que llamar a `useLanguage()` él mismo: el gancho de un hijo no vuelve a calcular las props que el padre ya armó.

Persistencia: `settings.profile.language` en SQLite. Pulsar **Español** o **English** hace dos cosas, en este orden:

1. `setLanguage` — la interfaz cambia ya, antes de que termine el guardado.
2. La intención `SET_LANGUAGE` — escribe el perfil, vuelve a registrar canales y botones de notificación, y si hay jornada abierta reetiqueta el servicio en primer plano.

Si el guardado falla, el selector vuelve al idioma que había en el perfil. El idioma **no** forma parte del borrador de Ajustes: pulsar Guardar no es lo que cambia el idioma, y un cambio de idioma no borra el nombre, la hora o los campos de la zona admin que aún no se han guardado.

El alta usa el mismo `LanguageSwitch`. El idioma se guarda al pulsar el chip. Entrar vuelve a enviar `getLanguage()` en `COMPLETE_ONBOARDING`.

## Arranque en frío

Al evaluar el módulo, el idioma provisional es el del dispositivo (en test, siempre español). Eso no se pinta.

`app/_layout.tsx` deja el splash puesto hasta que `ensureRuntimeReady()` termina. Ahí `applyPersistedLanguage()` lee el perfil y publica `es` o `en` antes del primer árbol. Si no hay perfil, gana el idioma del teléfono: etiqueta principal `en` → inglés; `es` o cualquier otra → español. No hay un fotograma en español que salte a inglés.

`applyPersistedLanguage()` se puede llamar otra vez y siempre relee el perfil. Las tareas headless lo hacen dentro de `ensureRuntimeReady()` antes de componer el texto de una notificación.

## Pantallas que ya estaban montadas

Las pestañas siguen montadas (`freezeOnBlur: false`). Además, al cargar el bundle se llama a `enableFreeze(false)` de `react-native-screens`: sin eso, la pila de atrás y un modal que perdió el foco se quedan congelados y no oyen el cambio hasta que vuelven a enfocarse. Cada `Stack` (raíz, arranque, alta, sesión, destinos, expediente, sistema, legal, soporte) lleva `freezeOnBlur: false`.

Un modal que ya está abierto (salida, almuerzo, nota, diálogo de aviso) recalcula su título y sus botones. Un toast visible guarda un traductor y se reescribe con el idioma nuevo mientras sigue en pantalla. La vista previa del expediente en Reportes también.

## Fechas, horas y cantidades en pantalla

| Qué | Español | Inglés |
| --- | --- | --- |
| Fecha | `sáb, 26 sep 2026` | `Sat, Sep 26, 2026` |
| Hora | `11:42 PM` | `11:42 PM` |
| Horas en pantalla | `8,25 h` (coma) | `8.25 h` (punto) |
| Importe | `$12.50` | `$12.50` |

La coma decimal es solo de la interfaz (`formatLocaleNumber` / `formatUiDecimal`). `formatCurrency`, `formatCents`, `formatHundredths` y `displayStatement` siguen con punto: el PDF y la nómina no cambian. Las horas en pantalla no pasan a 24 h ni a «a. m.»: los dos idiomas usan AM/PM.

Los tipos de línea del estado de nómina (`REGULAR`, `OVERTIME_DAILY`, …) se muestran con `tLineKind` (Regulares, Horas extra, Doble tiempo, Tránsito, Almuerzo). En inglés el traslado y esa línea se llaman **Travel** (Start travel, Traveling, Paid travel). El código del asiento no se reescribe.

## Notificaciones

`SET_LANGUAGE` llama a `NotificationService.refreshLocalization`: canales, botones de la salida (sigo trabajando / cerrar jornada / trasladar) y el recordatorio diario.

En Samsung One UI el nombre de un canal ya creado no cambia si solo se vuelve a registrar. Si el nombre guardado no es el del idioma activo, se borra ese canal y se crea de nuevo. Si el nombre ya coincide, no se borra: hacerlo en cada arranque resetearía el ajuste del usuario.

El texto del servicio en primer plano se fija al arrancarlo. Con jornada abierta, el cambio de idioma lo detiene y lo vuelve a poner (`relabel: true`). Una tarea headless espera a `ensureRuntimeReady()` (y por tanto al idioma guardado) antes de armar el aviso.

## Qué no se traduce

El idioma de la interfaz no reescribe lo ya sellado ni lo que tiene que ser idéntico byte a byte.

| Qué | Idioma | Por qué |
| --- | --- | --- |
| PDF ya generado (`documents/packs/`) | El del momento en que se selló | Se comparte el archivo guardado. No se regenera. |
| HTML/PDF nuevo (`reportTemplates.ts`) | Siempre español | `t(..., "es")` y fechas con `lang: "es"`. El mismo statement produce el mismo documento. |
| Asientos del ledger, `intent`, hashes, manifiesto | Códigos | La UI traduce el `intent` al leer. Un `reason` sin clave no se muestra. |
| Notas, nombres de destino, direcciones | Lo que escribió la persona | No son copy de la app. |
| Importes | `$1.50` fijo | La nómina es en dólares y el PDF usa el mismo formato. |
| Identificador de política | Código | La etiqueta visible sale de `settings.policies.${id}`. |

Los textos legales de la pantalla sí siguen el idioma. `DISCLOSURE_VERSION` es la misma en los dos: cambiar el idioma no pide aceptar otra vez.

Las claves viven en `src/i18n/es.ts` y `src/i18n/en.ts` (Soporte en `supportEs.ts` / `supportEn.ts`). Si falta una, TypeScript no compila. Jest exige la misma forma (`i18n.test.ts`), que no haya copy en duro en JSX, `Alert.alert`, títulos de navegador ni `accessibilityLabel` (`hardcodedCopy.test.ts`), que el árbol montado pase de español a inglés y vuelva (`languageSwitch.test.tsx`) y que el arranque en frío no pinte el idioma provisional (`coldStart.test.tsx`).

## Lista de comprobación en un Android (Samsung)

Build de release (`npm run build:android:preview`). Anota el `versionCode`: tiene que ser distinto del anterior. El teléfono puede estar en español. Empieza con los datos de la app borrados si vas a mirar el primer arranque.

**I1. Primer arranque.** Sistema en English y sin perfil: bienvenida, descargo, permisos y perfil salen en inglés. Sistema en español: salen en español. Sistema en francés: español. No hay un parpadeo español → inglés al abrir.

**I2. Alta.** En el paso de perfil pulsa el otro idioma. El título del paso, el botón Entrar y, si vuelves a ver una pantalla del asistente que siga montada, cambian antes de pulsar Entrar. El chip marcado es el idioma que se ve.

**I3. Ajustes y Soporte, el mismo estado.** En Ajustes pulsa **English**. Sin Guardar, el chip de Ajustes queda en English. Abre Soporte: el mismo chip está en English, no en Español. Al revés también: si cambias el idioma dentro de una guía, Ajustes muestra ese idioma al volver.

**I4. Barra de pestañas.** Al pulsar, sin cambiar de pestaña, los cuatro títulos pasan a Today / History / Reports / Settings (y vuelven a Hoy / Historial / Reportes / Ajustes).

**I5. Hoy.** Título, hero, horas netas con coma en español y punto en inglés (`8,25 h` / `8.25 h`), estimado en `$12.50` en los dos, aviso de tirar para actualizar (Actualizar / Refresh) y consejos de Soporte.

**I6. Historial.** Cabecera, filtros, resumen semanal, fechas (`lun, 5 oct 2026` / `Mon, Oct 5, 2026`) y la fila que dice «continúa el lun» / «continues on Mon». El importe sigue `$12.50`.

**I7. Reportes.** Rollup, vista previa (las líneas y «Total horas» / «Total hours»), banners de sello y los botones de generar y compartir. La vista previa cambia de idioma sin salir de la pantalla.

**I8. Cabeceras de la pila.** Con una sesión abierta encima de Historial, cambia el idioma en Ajustes y vuelve: la cabecera Sesión / Session y la de Rastro / Trail ya están en el idioma nuevo, igual que Destinos, Nuevo destino, Expediente, Paquete de evidencia, Salud operativa y Resolver conflicto.

**I9. Pila de atrás.** Deja Hoy montado, entra en una sesión y, desde Ajustes (o sin cerrar la sesión, si el selector está a la vista), cambia el idioma. Al volver, Hoy ya está en el idioma nuevo: no hace falta matar la app ni volver a entrar.

**I10. Modal abierto.** Abre la salida («Saliste del área» / «You left the area»), el almuerzo o una nota, y cambia el idioma con el modal todavía abierto. Título, botones y la X (Cerrar / Close) cambian sin cerrarlo.

**I11. Aviso.** Provoca un toast (por ejemplo copiar el código en Reportes). Mientras se ve, cambia el idioma: el texto del aviso cambia antes de desaparecer.

**I12. Salud.** Cada fila del diagnóstico, «Reparar» y el nombre del sensor. El valor running / stopped sale traducido.

**I13. Conflicto y legal.** Cabecera, cuerpo del descargo y de la retención, en el idioma activo. Cambiar el idioma no pide aceptar el descargo otra vez.

**I14. Soporte.** Índice, una guía (título, pasos y el control resaltado), el modo práctica (banner «Modo práctica» / «Practice mode») y los consejos de pantalla. Todo cambia al pulsar el chip de la propia guía.

**I15. No encontrado.** Un enlace a una sesión que no existe muestra el título y el botón de volver a Hoy en el idioma activo.

**I16. Persistencia.** Cierra la app desde recientes y ábrela. Sigue el idioma elegido, no el del sistema. El primer fotograma ya es ese idioma.

**I17. Notificación.** Con jornada abierta, el aviso persistente pasa a «Shift in progress» / «Jornada en curso» sin reinstalar. Si provocas una salida, el título y los tres botones salen en ese idioma. El recordatorio diario también. En Ajustes del sistema, el canal de la jornada muestra el nombre nuevo (en Samsung hace falta borrar y crear el canal; la app lo hace solo cuando el nombre no coincide).

**I18. Expediente sellado.** Sella un periodo con la UI en inglés y abre el PDF: el documento sigue en español (comprobante, Regulares, Horas extra) y los importes con punto (`$1.50`). Vuelve a español en la UI: el PDF ya compartido no cambia y el SHA-256 es el mismo. La pantalla del estado de nómina sí cambia (Regulares / Regular, y la coma de las horas).

**I19. Zona admin.** Con el PIN abierto, las políticas muestran la etiqueta traducida (`settings.policies.*`), no solo el código. El código de la política en la sesión no se traduce y no cambia el cálculo.
