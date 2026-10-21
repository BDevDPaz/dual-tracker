# Prueba de campo 4 — 20 oct 2026

Expediente `W2026-10-19-3ccdb038`, sellado en `main` `2801b5b`. Samsung S22+, Android. Jornada de 11:51:12 a. m. a 2:18 p. m. (hora del Pacífico), 147 min, $25/h. El comprobante pagó 137 min regulares y 10 de tránsito. El primer trayecto salió a la 1:04:21, el ENTER fiable del destino es la 1:09:34 y la llegada confirmada cae hacia la 1:11 (5–7 min, no 10). El sitio 1 salió en 83 min y el real en obra es 73. El segundo traslado se canceló a las 2:18 y ese rato contó como trabajo en sitio.

El expediente ya sellado se verifica igual. Su PDF no se reescribe. Un sello nuevo es manifiesto v5 y documento v3: trae la identidad del build, la zona de cada jornada, el `prevHash` de cada asiento y el anexo de tramos. Eso cambia `packHash` y `contentHash` de un periodo que se vuelva a sellar. No reselles la semana del 20 oct si quieres conservar los números de ese comprobante.

## Qué pasó

1. **El tránsito salió en 10 min.** La salida usa la hora de confianza del teléfono. La muestra que confirma la llegada puede traer el reloj del GPS, y ese reloj se aceptaba hasta 5 min por delante. Un adelanto de 5 min alarga un trayecto de 5 hasta 10. El ajuste manual de la 1:43, con «conservar GPS», no movió ese tramo: la jornada seguía abierta y el recorte solo corre cuando el fin de la jornada cambia. En una jornada ya cerrada, ese mismo recorte sí podía dejar el tramo corto y «conservar GPS» no lo devolvía.
2. **Cancelar el traslado lo dejaba como trabajo en sitio.** Desde el inicio del trayecto hasta la cancelación no había línea de tránsito. El tiempo se sumaba a la jornada del sitio.
3. **Los minutos por sitio salían de las migas.** `siteId` no cambia hasta la llegada, así que el trayecto se lo queda el sitio de salida. 83 es ese rato, no los 73 que van del fichaje a la 1:04:21.
4. **El JSON y el PDF no listaban cada tramo.** No se veía origen, destino, si se canceló, si se pagó ni si un ajuste lo recortó.
5. **La cadena no se podía rehacer solo con el documento.** Los asientos exportados no traían `prevHash` ni `payloadJson`, y había huecos de id. Tampoco constaban la versión de la app, el `versionCode`, el commit ni la zona de la jornada.

## Qué quedó

- La llegada no cierra después de la hora de confianza. Si ya hay un ENTER fiable del destino, el tramo termina en ese instante. En esta jornada eso es 5 min (1:04:21 → 1:09:34).
- «Conservar GPS» devuelve los tramos al intervalo de antes del recorte, también los que el ajuste había dejado fuera.
- Un traslado cancelado se paga como tránsito desde que empezó hasta la hora de cancelar, a 1× y sin extra en esa línea. La etiqueta es «Tránsito (cancelado)» / “Travel (cancelled)”, con la hora y la nota si la hay (por ejemplo «llamó el encargado»). Después de cancelar, el tiempo sigue la jornada: sitio, o cierre si se termina el día. Un cancelado antiguo, sin `paid: true`, sigue contando como trabajo en sitio: no se reescribe.
- Los minutos por sitio salen de la jornada (ficha activa y sitio en curso). No usan el enter/exit de la geocerca. En esta jornada: 73 min en el primero y 44 en el segundo (de la llegada a la salida de la 1:53).
- El JSON del expediente y el PDF (empleado y empleador) listan cada tramo: origen, destino, inicio, fin, cancelado, pagado, minutos y el recorte si lo hubo.
- Manifiesto v5. Entran en `packHash` la versión de la app, el `versionCode`, el commit y la zona de cada sesión. En Jest esos dos últimos pueden ser null: el sello los escribe igual. El documento v3 es la plantilla; no entra en el hash. Cada asiento exportado trae `prevHash` y `payloadJson`, en un tramo de ids sin huecos. Un tercero recomputa `sha256(prevHash + payloadJson)` y comprueba que el `prevHash` de cada fila sea el hash de la anterior. El `prevHash` de la primera fila es el ancla. Un paquete v1–v4 se verifica con su formato.

## Checklist en el teléfono

Mismo equipo: Samsung S22+, Android, español. Build nuevo de esta rama. No reutilices el APK del 20 oct. Anota la hora de cada paso. Si algo no cuadra, captura el comprobante y el JSON.

| Id | Qué hacer | Qué tiene que pasar |
| --- | --- | --- |
| J1 | Dos destinos guardados, con coordenadas. Inicia jornada en el primero y espera el fichaje. | La jornada queda activa en ese sitio. |
| J2 | Sal del primero, inicia el traslado al segundo y no confirmes a mano. Espera a que la llegada se fiche sola (ENTER fiable). | El tránsito pagado es el de la salida hasta ese ENTER, del orden de 5–7 min si el viaje fue ese. No sale 10 por un reloj de GPS adelantado. |
| J3 | En el segundo sitio, inicia otro traslado y cancélalo. En la nota escribe «llamó el encargado». Sigue un par de minutos en el sitio y cierra la jornada. | Hay una línea «Tránsito (cancelado)» con la hora de la cancelación y la nota. Esos minutos van a 1×, sin extra en esa línea. El rato de después de cancelar cuenta en el sitio, no dentro del tránsito. |
| J4 | Mira el tiempo por sitio en el rastro o en el resumen, y compáralo con la hora de fichaje y la de salida. | Cuadra con la jornada (ficha y sitio), no con las entradas y salidas dudosas de la geocerca. |
| J5 | Sella el periodo y abre el JSON y el PDF del empleador. | Cada tramo lista origen, destino, inicio, fin, cancelado, pagado, minutos y, si hubo un ajuste de horas, el recorte. El PDF trae el anexo de tramos. |
| J6 | En el manifiesto del JSON mira versión, build, commit y zona. Revisa que cada asiento tenga `prevHash` y `payloadJson`, y que el `prevHash` de una fila sea el hash de la anterior. | La app dice su versión. La zona es la de la jornada (Pacífico en esta prueba). La cadena se puede recomputar sin la base del teléfono. |
| J7 | Abre el expediente del 20 oct (`W2026-10-19-3ccdb038`) y comprueba el código. | Sigue verificando. El PDF sellado no cambia. No reselles esa semana si quieres dejar los 137 + 10 como están. |
