# Pruebas de teléfono — 1.0.0 RC1

Plan único para decidir si esta candidata pasa a **1.0.0 final**. No repite los pasos de cada caso: cada bloque apunta a la lista que ya está escrita. Se ejecuta en el **Samsung Galaxy S22+** (o el equipo de Byron), con el APK `preview` de este commit. No se usa Expo Go.

Cómo instalar: [BUILD.md](BUILD.md). No hace falta otra etiqueta git: el commit del APK es el de esta candidata.

## Qué build es RC1

| Dato | Tiene que ser |
| --- | --- |
| Paquete | `com.bdevdpaz.dualtracker` (la app real). D11 es otro paquete y solo entra en ese caso. |
| Versión | `1.0.0` |
| Canal | `RC1` (perfil `preview`; `preview-d11` lo hereda) |
| `versionCode` | Entero **mayor que 3**. El último preview fue el 3. EAS lo sube solo (`appVersionSource: remote`, `autoIncrement`). No se fija en el repo y no se reinicia. |
| Línea en Ajustes y en Soporte | `Versión 1.0.0 (RC1) · build N` |
| La misma línea en English | `Version 1.0.0 (RC1) · build N` |
| Diagnóstico | `versionLine` igual a esa frase, `appVersion` `1.0.0`, `releaseChannel` `RC1`, `contentVersion` `soporte.v5`. Sin coordenadas, nombre, tarifa, correo ni `enc:v1`. |

`N` es el `versionCode` de ese APK. Anótalo en la columna Build de cada lista, junto con la fecha, el modelo, la versión de Android y el commit.

Si la línea no trae `(RC1)` o el número no es mayor que 3, para. Ese APK no es la candidata.

## Orden

1. Identidad de la build (tabla de arriba), en español y en English. Es el caso **S15**.
2. Fichaje: **G1–G7** y, en el mismo recorrido si el terreno da, **M1–M8**.
3. Soporte que aún no hayas cubierto: **S1–S16**.
4. Idioma: **I1–I19**.
5. Visual y teclado: **V1–V20** (fuente 1.0, 1.3 y 2.0, como pide esa lista).
6. Confiabilidad: **R1–R12**.
7. PIN, portal, rangos y plano: **T1–T18**.
8. Matriz de cifrado: **D1–D15**, con el reparto de la sección siguiente.

Un caso no se da por hecho porque otro lo roce. Si un paso ya salió bien dentro de otro bloque, anótalo como Aprobado y escribe en Notas en qué caso se vio. No dejes la celda vacía.

## Dónde está cada lista

| Ids | Documento | Qué cubre |
| --- | --- | --- |
| G1–G7 | [PRUEBAS_GEOCERCA.md](PRUEBAS_GEOCERCA.md) | Llegar ya dentro, llegar en vehículo, no cerrar a 0.00 h, salir de verdad, dos destinos, pantalla apagada, app muerta. |
| M1–M8 | [PRUEBAS_MULTI_DESTINO.md](PRUEBAS_MULTI_DESTINO.md) | Llegada, traslado pagado, almuerzo desde la salida, cómo se ve el pago, geocercas solapadas, radio y archivo, app muerta en traslado, medianoche. |
| S1–S16 | [SOPORTE.md](SOPORTE.md) | Guías, idioma de la guía, consejos, modo práctica aislado, diagnóstico, Samsung, estados. S15 es la línea de versión. |
| I1–I19 | [IDIOMA.md](IDIOMA.md) | Arranque, pestañas, fechas, avisos, notificación, PDF sellado en español, zona admin. |
| V1–V20 | [UI_SISTEMA_VISUAL.md](UI_SISTEMA_VISUAL.md) | Ancho, fuente, gestos, cada pantalla y la cadena de foco del teclado. |
| R1–R12 | [CONFIABILIDAD_TANDA1.md](CONFIABILIDAD_TANDA1.md) | Abandono, sensores, hora de red, firma, retención. |
| T1–T18 | [TANDA2.md](TANDA2.md) | PIN local y de empleador, clave fijada, portal, rangos de Reportes, plano del rastro, diagnóstico sin secretos. |
| D1–D15 | [PRUEBAS_DISPOSITIVO.md](PRUEBAS_DISPOSITIVO.md) | Matriz de cifrado de campos. |

## Matriz D en esta candidata

| Caso | Puerta de RC1 |
| --- | --- |
| D1, D2, D3, D6, D7, D8, D9, D13, D14, D15 | Aprobado en el APK real, Android. |
| D11 | Aprobado en el APK `preview-d11` («Dual Tracker D11», `com.bdevdpaz.dualtracker.d11`). El llavero tiene que fallar. No uses ese APK para el resto. |
| D12 | Aprobado en el navegador (la web no certifica jornadas). |
| D4, D5, D10 y la columna iOS del resto | No se ejecutan. Anótalos «No ejecutado — iOS, post-1.0». No bloquean. |

## Lo que no es un fallo

Estas cuatro cosas están aceptadas para 1.0.0. Confírmalas en el acta; no las conviertas en un arreglo de última hora.

- **Doze y Samsung.** Con batería restringida o suspensión profunda, la geocerca puede tardar o no llegar con la pantalla apagada. Con «Jornada en curso» visible y la batería sin restricciones, un aviso tardío que luego ficha (muestra o entrada aceptada) es la limitación, no un Fallido. Si en esas condiciones G1, G4 o G6 no fichan, sí es Fallido.
- **Casa → primer sitio.** No se paga. **S13** tiene que decirlo. El trayecto entre dos destinos de la misma jornada sí se paga (M4).
- **Doble tiempo y séptimo día.** Siguen apagados en la zona admin. No los enciendas para esta candidata: asesoría legal no ha confirmado el criterio.
- **iOS.** No hay iPhone en esta acta. El respaldo por cambio significativo de ubicación queda fuera de 1.0.0.

La migración de las bases de W Tracker, LEDTracker y GEOTrack no se prueba. No aplica: las versiones anteriores nunca se publicaron.

## Criterio para promover RC1 a 1.0.0 final

Se promueve solo si todo esto es cierto en **el mismo** APK real (y, para D11 y D12, en sus builds indicados):

1. La línea de Ajustes, la de Soporte y `versionLine` del diagnóstico son `Versión 1.0.0 (RC1) · build N` en español y `Version 1.0.0 (RC1) · build N` en inglés, con el mismo N > 3.
2. G1–G7, M1–M8, S1–S16, I1–I19, V1–V20, R1–R12 y T1–T18 están en Aprobado. Un Fallido, un bloqueo o una celda vacía deja la candidata en RC.
3. D1, D2, D3, D6, D7, D8, D9, D11, D12, D13, D14 y D15 están en Aprobado en la plataforma de la tabla anterior.
4. Las cuatro limitaciones de arriba se anotaron y se comportaron como están escritas. No hace falta un caso extra para “superarlas”.
5. iOS sigue sin ejecutar. Eso no impide el paso a final: es decisión del dueño para después de la 1.0.0.

Al promover, en un cambio posterior (no en esta candidata):

- Quitar `RC1` del perfil `preview`, o sustituirlo cuando exista otra candidata. La 1.0.0 final no debe seguir presentándose como RC1.
- Dejar la versión en **1.0.0**. No subirla a 1.0.1 solo por quitar el canal.
- No tocar el contador remoto de `versionCode`. El build final sigue por encima del N de esta RC.
- La etiqueta `1.0.0` se crea entonces, no antes de esta acta.

## Acta

| Bloque | Build N | Resultado | Notas |
| --- | --- | --- | --- |
| Identidad (S15, es/en, diagnóstico) | | | |
| G1–G7 | | | |
| M1–M8 | | | |
| S1–S16 | | | |
| I1–I19 | | | |
| V1–V20 | | | |
| R1–R12 | | | |
| T1–T18 | | | |
| D1 D2 D3 D6 D7 D8 D9 D13 D14 D15 | | | |
| D11 (APK D11) | | | |
| D12 (web) | | | |
| iOS (D4 D5 D10 y columna iOS) | — | No ejecutado | post-1.0 |
| Limitaciones aceptadas | | | Doze/Samsung, casa, banderas legales |

| Promover a 1.0.0 final | Responsable | Fecha |
| --- | --- | --- |
| ☐ Sí, los cinco puntos del criterio se cumplen | | |
| ☐ No | | |
