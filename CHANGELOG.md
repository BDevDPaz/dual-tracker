# Changelog

Todos los cambios notables de Dual Tracker V1.0.0 se documentan en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/),
y este proyecto adhiere a [Versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

Cambios en `main` después de los PRs #1–#12. La candidata 1.0.0-rc.1, abierta por el #13, sigue descrita en la sección de abajo. Aquí entra lo que esa sección todavía no listaba (#13–#27).

### Añadido

- **#13** Candidata 1.0.0 (RC1). La versión visible pasa a 1.0.0 y el perfil `preview` expone el canal RC1 en Ajustes, Soporte y el diagnóstico. El `versionCode` sigue en EAS. El contenido de esa candidata está en [1.0.0-rc.1].
- **#14** Restyle premium: obsidiana, oro y Montserrat 400/500/600 en Hoy, Historial, Reportes, Detalle, Rastro, Ajustes y Salud. No cambia la nómina, el libro ni los hashes. Lista: `docs/UI_PREMIUM.md`.
- **#15** Comprobante premium. `documentVersion`, `documentTheme` y `documentLocale` quedan fuera de `packHash` y de `contentHash`. El QR es el `packHash`, sin URL. Un expediente ya sellado no se reescribe. Lista: `docs/COMPROBANTES_PREMIUM.md`.
- **#22** Manifiesto v5 (`PACK_MANIFEST_VERSION = 5`): identidad del build y zona de cada sesión dentro de `packHash`; cada eslabón exporta `prevHash` y `payloadJson`; anexo de tramos. La plantilla del PDF pasa a documento v3, fuera de los dos hashes. Lista: `docs/PRUEBA_CAMPO_4.md`.
- **#26** Fase 3: estado de monitoreo derivado, latido por componente (`service_health`), aviso persistente con sitio y GPS, catálogo de severidad, anomalías deduplicadas, integridad del dispositivo (`modules/device-integrity`) y puntaje informativo de la ubicación. Lista: `docs/PRUEBA_CAMPO_7.md`.
- **#27** Fase 4: cobertura de monitoreo, auditoría de avisos críticos, reconstrucción de minutos (`sessionReplay`), índice único `idx_ledger_prev_hash`, espera de llegada y `BOOT_RESUME` (`modules/device-uptime`). Lista: `docs/PRUEBA_CAMPO_8.md`.

### Corregido

- **#16** La hora de red ruidosa no quita VALIDADA: hacen falta muestras coherentes y, con ubicación buena, la deriva solo avisa. También el ENTER duplicado, la salida en histéresis y el sello «SELLADO» partido. Lista: `docs/PRUEBA_CAMPO_1.md`.
- **#17** Corte, almuerzo, rastro, reglas y ENTER de borde. El servicio de ubicación sigue en el almuerzo. Una regla sale como aplicada solo si produjo minutos. Lista: `docs/PRUEBA_CAMPO_2.md`.
- **#18** Se rechazan horas de jornada que todavía no han pasado. Ese fin no se guarda, el sello se niega y la nómina de esos minutos no cambia.
- **#19** El almuerzo fijo no pasa de la jornada. Cada fila muestra el redondeo de sus propios minutos. Lista: `docs/PRUEBA_CAMPO_3.md`.
- **#20** Auditoría del 2026-10-20: A1–A4 y A6–A10. El sello no reutiliza un pack con el libro roto, `verify` exige la firma de un v4 que nació firmado, el incremental relee el prefijo, el cierre automático no guarda un fin futuro, y el certificado, la pausa y el almuerzo fijo cuadran con la nómina. A5 (deriva al volver a primer plano, solo iOS) sigue pendiente. Lista: `docs/AUDITORIA_2026-10-20.md`.
- **#21** Auditoría 2: el sello, el candado, el PIN y los estados desconocidos quedan atómicos o fuera de la nómina. La zona horaria es la de la empresa y las horas extra siguen en California. El hallazgo 17 queda en el código y sin validar en un iPhone. Lista: `docs/AUDITORIA_2_2026-10-20.md`.
- **#22** Un traslado cancelado nuevo se congela `paid: true` y se paga a 1×, sin extra, hasta la hora de cancelación. Se muestra como «Tránsito (cancelado)», con esa hora y la nota si la hay. Un cancelado legado (`paid !== true`) sigue contando como trabajo en el sitio. Los minutos por sitio salen de la jornada. Lista: `docs/PRUEBA_CAMPO_4.md`.
- **#23** Auditoría 3: la primera clave del PIN exige la huella fuera de banda o el ancla del build. Un pack cuya firma cuadra, sin esa ancla, no queda como identidad verificada. Si el sello no commitea, se borra el directorio del intento. Lista: `docs/AUDITORIA_3_2026-10-20.md`.
- **#24** Fase 1: una lectura simulada no ficha sola y queda en el libro, en Salud y en el PDF. El salto descuenta la precisión de los dos fixes y usa la hora del fix. Si el servicio en primer plano se cae, el worker intenta arrancarlo y lo anota. Lista: `docs/PRUEBA_CAMPO_5.md`.
- **#25** Fase 2: cada `MANUAL_PATCH` guarda el antes y el después. Al cerrar se añade `SESSION_SEALED` con `sessionHash`. El expurgo y `TRACE_PURGED` van en la misma transacción. Los cambios de permiso, GPS, avisos y batería quedan en el libro. La ubicación aproximada de Android 12+ avisa y no baja el pago. Lista: `docs/PRUEBA_CAMPO_6.md`.

### Seguridad

- **#20** Un manifiesto v4 que nació firmado y llega sin firma falla con `SIGNATURE_MISSING`. Otra clave falla con `SIGNATURE_KEY`. `PACK_UNSIGNED` sigue siendo el sello sin llavero. La clave que se compara es la del llavero de firma del pack, no la del código de aprovisionamiento del PIN.
- **#21** Si el asiento del PIN no se escribe, SecureStore vuelve al estado anterior y el código se puede repetir. `--pin` en la CLI avisa: el secreto puede ir en archivo, `DT_PIN`, prompt o stdin.
- **#23** La primera fijación de la clave del empleador ya no es de confianza al primer uso. Hace falta la huella tecleada o `src/config/employerKeyAnchor.ts`. Sin ancla, `verify` devuelve `identity: unverified`.
- **#24** `LocationObject.mocked` no abre la llegada automática. El hecho queda como `MOCK_LOCATION`.
- **#27** `idx_ledger_prev_hash` es único. Si ya hay `prev_hash` duplicados, el índice no se crea, el fallo queda en el log y los asientos no se reescriben.

### Limitaciones conocidas

- **Android 12+.** El sistema puede negar el servicio en primer plano si la app está en segundo plano y no está exenta de batería. Ese fallo queda como `SERVICE_RECOVERY_FAILED`. Android 14 exige el tipo `location`.
- **Samsung.** El sueño profundo y un Force Stop no se recuperan hasta abrir Dual Tracker. El worker no baja de 15 minutos.
- **Root.** La detección mira rutas (`su`, Magisk, busybox). Un Magisk oculto puede no salir. Sin el módulo nativo no se afirma que el teléfono esté limpio.
- **Reconstrucción.** Si la política de tránsito cambia después de congelar un tramo, `sessionReplay` puede marcar `SESSION_REPLAY` sin que la fila se haya tocado. No reescribe la nómina.

### Pendiente

- Respaldo de geocerca por cambio significativo de ubicación en iOS (post-1.0). El hallazgo 17 de la auditoría 2 (actualizaciones diferidas en iOS) está en el código y no se ha medido en un iPhone. A5 de la auditoría del 2026-10-20 sigue pendiente.

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
- **Migración de bases heredadas de los proyectos fuente anteriores (W Tracker, LEDTracker, GEOTrack).** No aplica: esas versiones anteriores nunca se publicaron. El producto es Dual Tracker V1.0.0.
