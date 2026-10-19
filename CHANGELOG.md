# Changelog

Todos los cambios notables de Dual Tracker se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Pendiente

- Respaldo de geocerca por cambio significativo de ubicación en iOS (post-1.0).

## [1.0.0-rc.1] - 2026-10-19

Primera candidata a publicación. Parte de `main` en `b2bddad` (PRs #1–#12 ya fusionados). Nunca se publicó una versión anterior: no hay usuarios a los que migrar.

La versión visible es **1.0.0** (`app.json`, `package.json`, `APP_VERSION`). El perfil `preview` de EAS expone el canal **RC1** (`extra.releaseChannel`). En Ajustes y en Soporte se lee `Versión 1.0.0 (RC1) · build N` (inglés: `Version 1.0.0 (RC1) · build N`). El `versionCode` de Android sigue en el servidor de EAS (`appVersionSource: remote`, `autoIncrement` en `preview`). El último preview fue el **3**; el siguiente tiene que ser mayor. No se etiqueta esta candidata.

### Añadido

- **#1** Rehidratación del reflejo al volver a primer plano y al ganar el foco, y pull-to-refresh en las pantallas de datos. Una escritura de la geocerca o del vigilante se ve sin reiniciar la app.
- **#3** Varios destinos en una sola jornada y traslado pagado entre ellos (de fábrica a ×1, cuenta para el extra). Cadena «Obra A → Obra B» en Historial, detalle y comprobante. Lista de teléfono: `docs/PRUEBAS_MULTI_DESTINO.md` (M1–M8).
- **#4** Idioma de la interfaz (Español / English) al pulsar el chip, sin esperar a Guardar. El primer arranque sigue el perfil o, si no hay, el idioma del teléfono.
- **#5** Diagnóstico de geocerca en Salud (aceptado o rechazado, y el motivo, sin coordenadas). Lista: `docs/PRUEBAS_GEOCERCA.md` (G1–G7).
- **#7** Soporte dentro de Ajustes: guías, preguntas, problemas, consejos descartables y modo práctica que no toca el expediente. Diagnóstico para compartir. Lista: `docs/SOPORTE.md` (S1–S16).
- **#8** El mismo selector de idioma en Ajustes, Soporte y el alta, aplicado en toda la app en el acto (pestañas, modales, avisos, notificación). Lista: `docs/IDIOMA.md` (I1–I19).
- **#9** Sistema visual (ritmo, áreas seguras, fuente del sistema, teclado y cadena de foco). Lista: `docs/UI_SISTEMA_VISUAL.md` (V1–V20).
- **#10** Marca: icono Pin-Reloj de la app y símbolo de llegada confirmada en la notificación y en la interfaz.
- **#11** Confiabilidad, tanda 1: jornada huérfana a Revisar sin inventar horas, sensores que bloquean VALIDADA, hora de red, firma Ed25519 del expediente y retención que no borra sin expediente. Lista: `docs/CONFIABILIDAD_TANDA1.md` (R1–R12).
- **#12** Tanda 2: PIN de administración del empleador (`DTPIN1`, un solo uso), portal HTTPS del expediente firmado, reportes por semana, quincena, mes o fechas, y plano local del rastro (sin teselas ni envío de coordenadas). Lista: `docs/TANDA2.md` (T1–T18).

### Corregido

- **#2** Editar sesión ya no convierte dos `HH:mm` iguales, sin tocar los relojes, en un turno de 24 h. Si el minuto no cambió se conservan los milisegundos. Guardar no se habilita solo por la nota.
- **#3** Al llegar al segundo sitio se seguían viendo los destinos de la jornada. Un ENTER no se perdía por una salida pendiente del sitio anterior. El almuerzo puede arrancar desde la salida. El pago del tramo queda congelado al cerrarlo.
- **#5** El fichaje automático en Android ya no descarta la llegada por ir en vehículo ni cierra la jornada en 0.00 h por un EXIT inmediato. Si el aviso del sistema no llega, la muestra del servicio en primer plano ficha. Otro destino activo entra en la misma jornada.
- **#6** La porción de medianoche se lee en el comprobante con su tramo y su fecha. Las jornadas de 0 min salen del comprobante del empleado y siguen en el expediente. El total cuadra en centavos. La bandera de una nota ya no baja de línea.
- **#8** El idioma ya no se queda a medias entre el borrador de Ajustes, el alta y Soporte, y el primer fotograma no parpadea del idioma del teléfono al del perfil.

### Seguridad

- **#12** El hash del PIN vigente es scrypt (N=16384, r=8, p=1, sal aleatoria). Uno legado SHA-256 sigue verificando y se reescribe al acertar. La comparación no ataja por longitud.
- **#12** La primera clave Ed25519 del empleador queda fijada en el llavero (`EMPLOYER_KEY_PINNED`). Otra clave se rechaza hasta desbloquear la zona admin (`EMPLOYER_KEY_REPINNED`). El archivo de clave no se versiona y el generador no imprime el secreto.
- **#12** El portal solo hace POST si hay una URL https. La clave de idempotencia es el `packHash`. No sube el PDF. Apagado y sin URL por defecto.
- **#11** La firma del manifiesto no entra en `packHash`. Sin llavero el sello sigue como `unsigned-v1`, con aviso, y no reescribe un PDF ya compartido.
- El diagnóstico de soporte sigue en lista blanca: sin coordenadas, sin nombre, tarifa, correo ni sobres `enc:v1`.

### Limitaciones conocidas

- **Android Doze y Samsung.** Con la app en suspensión profunda, o con la batería restringida, la geocerca puede tardar o no fichar con la pantalla apagada. «Solo mientras se usa» no ficha en segundo plano. Con el servicio en primer plano visible y la batería sin restricciones, las muestras cubren el hueco del aviso del sistema, pero el aviso puede llegar minutos tarde. Si la precisión es peor que el radio del sitio, no hay fichaje automático.
- **El viaje de casa al primer sitio no se paga.** El traslado pagado es el tramo entre dos destinos de la misma jornada. Soporte lo dice en la pregunta correspondiente.
- **Doble tiempo (por encima de 12 h) y séptimo día** están en la política v2 y siguen apagados (`caDoubleTime`, `caSeventhDay`) hasta que asesoría legal lo confirme. No se encienden en esta candidata.
- **iOS no está probado.** No hay acta de iPhone para esta candidata. El respaldo por cambio significativo de ubicación queda para después de la 1.0.0.
- **Migración de bases heredadas (W Tracker, LEDTracker, GEOTrack).** No aplica: las versiones anteriores nunca se publicaron.
