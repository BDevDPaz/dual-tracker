# Idioma de la interfaz (Español / English)

La app tiene dos idiomas de interfaz: **español** (base) y **inglés** (nómina de EE. UU.: overtime, double time, hourly rate, pay statement, job site, evidence pack). El selector está en **Ajustes → Perfil laboral** y, en el alta, en el paso de perfil. Las etiquetas del selector son los endónimos **Español** y **English**.

## Cómo se aplica

- Al pulsar un idioma se guarda en el perfil (`settings.profile` en SQLite) y la interfaz cambia **en el momento**, sin pulsar Guardar. El resto del formulario de Ajustes no se pierde.
- El valor vive en `settings.profile.language` (`es` | `en`). Al arrancar, `boot` y las tareas headless lo leen antes de pintar o de notificar.
- **Primer arranque** (aún no hay perfil): se usa el idioma del dispositivo. Si la etiqueta principal es `en` → inglés; si es `es` → español; cualquier otro idioma → español. En cuanto el usuario elige uno, ese queda guardado y gana sobre el del teléfono.
- Las pestañas de expo-router **siguen montadas**. El idioma es una suscripción (`useLanguage`): al cambiar, se repintan las pantallas montadas, la barra de pestañas, las cabeceras, los modales, los avisos, las pastillas de estado, las fechas (`formatDate`, rangos de semana, AM/PM) y la etiqueta de tirar para actualizar. Las pestañas no se congelan al perder el foco (`freezeOnBlur: false`), así el cambio llega también a las que no estás viendo.
- Notificaciones: el recordatorio diario, los botones de la salida (sigo trabajando / cerrar jornada / travel) y el texto del servicio en primer plano de Android se vuelven a registrar con el idioma nuevo. Una tarea headless (geocerca, temporizador de salida) hidrata el idioma del perfil antes de componer el texto, así que no se queda en el español por defecto del módulo.

Las claves viven en `src/i18n/es.ts` y `src/i18n/en.ts` (misma forma: si falta una, TypeScript no compila). Los avisos de `microcopy.ts` y los textos legales de `legal.ts` tienen los dos idiomas. Jest falla si los conjuntos de claves no coinciden (`src/i18n/__tests__/i18n.test.ts`) y si aparece copy en duro en el JSX (`hardcodedCopy.test.ts`).

## Qué no se traduce (a propósito)

El idioma de la interfaz **no reescribe** lo ya sellado ni lo que tiene que ser idéntico byte a byte.

| Qué | Idioma | Por qué |
| --- | --- | --- |
| PDF ya generado (comprobante y expediente guardados en `documents/packs/`) | El del momento en que se selló | Se comparte el archivo guardado. No se regenera al cambiar el idioma. |
| HTML/PDF **nuevo** (`reportTemplates.ts`) | **Siempre español** | Fechas con `lang: "es"`. El mismo statement produce el mismo documento aunque el teléfono esté en inglés. |
| Asientos del ledger, `intent`, `reason`, hashes SHA-256, manifiesto JSON | Códigos, no frases | La cadena de integridad no depende del idioma. La UI traduce el `intent` al leer (`t("ledger.…")`). Un `reason` sin clave no se muestra. |
| Notas del operario, nombres de destino, direcciones | Lo que escribió la persona | No son copy de la app. |
| Importes (`formatCurrency`) | `$1.50` fijo, USD | La nómina es en dólares y el PDF usa el mismo formato. No hay coma decimal ni separador de miles según el idioma. |
| Identificadores de política (`CA_DAILY8_WEEKLY40_v1`, …) | Código | La etiqueta visible sí se traduce; el id no. |

Los textos legales de la pantalla (descargo y retención) **sí** siguen el idioma de la interfaz. La versión aceptada (`DISCLOSURE_VERSION`) es la misma en los dos idiomas: cambiar el idioma no pide aceptar otra vez.

## Lista de comprobación en un Android

Build de release (`npm run build:android:preview`). Anota el `versionCode` del APK: tiene que ser distinto del anterior.

1. **Primer arranque.** Instala en un teléfono en inglés (o pon el idioma del sistema en English y borra los datos de la app). La bienvenida y el alta salen en inglés. Repite con el sistema en español: salen en español. Un sistema en francés cae a español.
2. **Selector.** En Ajustes, pulsa **English**. Sin pulsar Guardar, en el acto cambian: la pestaña (Today / History / Reports / Settings), el título de Ajustes, las pastillas (p. ej. Not certifiable, Validated), Salud operativa y el texto de tirar para actualizar (Refresh / Updating).
3. **Pestañas que ya estaban abiertas.** Con la jornada en Hoy, cambia el idioma en Ajustes y vuelve a Hoy, Historial y Reportes. Fechas como `Mon, Oct 5, 2026` y rangos `Mon, Oct 5, 2026 – Sun, Oct 11, 2026` (en español: `lun, 5 oct 2026 – dom, 11 oct 2026`). Horas en AM/PM. Los importes siguen `$12.50`.
4. **Modales y avisos.** Abre iniciar jornada, la salida o un aviso. El título, los botones y la etiqueta de la X («Close» / «Cerrar») están en el idioma nuevo. Un diálogo que ya estaba abierto se reescribe.
5. **Persistencia.** Cierra la app por completo (recientes) y ábrela. Sigue el idioma elegido, no el del sistema.
6. **Notificación.** Con jornada abierta, el aviso persistente de Android («Jornada en curso…» / «Shift in progress…») cambia al idioma nuevo. Si provocas una salida, el título y los tres botones salen en ese idioma. El recordatorio diario también.
7. **Expediente.** Sella un periodo en inglés y abre el PDF: el documento sigue en **español** (Comprobante / Expediente, Regulares, Horas extra). Vuelve a español en la UI y el PDF ya compartido no cambia. El código SHA-256 es el mismo.
8. **Alta.** En una instalación limpia, en el paso de perfil elige el otro idioma: las pantallas del asistente que sigan montadas cambian antes de pulsar Entrar.
