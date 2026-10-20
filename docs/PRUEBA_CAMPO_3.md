# Prueba de campo 3 — 19 oct 2026

Expediente `W2026-10-19-474e0ac3`, build de `main` `09ecb36`. La jornada 3 duró 36 min y se cerró con un almuerzo fijo de 60. La jornada 4 pagó 5 min y el comprobante escribió 0.09 h. El rastro salió con `pointCount` 0.

`packHash` y `contentHash` no cambian de algoritmo. `verify` sigue leyendo el statement guardado. El PDF ya sellado no se reescribe. Lo que cambia es la nómina de una jornada nueva (el almuerzo fijo no puede pasar de la jornada) y cómo se escriben las horas en pantalla y en los PDF que se generen a partir de ahora. Los floats del statement (`regularHours = minutos / 60`) siguen igual: no entran en este cambio.

## Qué pasó

1. **El almuerzo fijo se descontó entero.** La jornada 3 iba de 12:25 a. m. a 1:01 a. m. (36 min) y se cerró con un parche manual y 60 min de almuerzo declarado, sin hora de inicio ni de fin. Quedó en 0 min trabajados, con el aviso `NO_WORK_MINUTES#3`. El almuerzo del periodo subió a 70 min: esos 60 más otros 10 que sí cabían. Un almuerzo con inicio y fin ya se rechazaba si se salía de la jornada. Este no, porque solo traía minutos.
2. **La columna de horas no coincidía con los minutos.** La jornada 4 mostraba 0.09 h. La línea de nómina era 5 min (0.083 h) y el resumen del periodo, 0.08. El 0.09 salía de repartir el resto entre jornadas: 5 min solos son 0.08, y si otra fila comparte el total, la primera se queda la centésima de más.
3. **El rastro no tenía puntos.** `pointCount` 0. En esta prueba el modo **Miga de pan** estaba apagado. Sin ese modo no se guardan migas. No es un fallo de este build.

## Causa

- El descuento fijo solo hacía `Math.max(0, minutos)`. No tenía techo. Lo mismo en el prorrateo por segmento. La validación de «el almuerzo tiene que empezar y terminar dentro» mira el intervalo, no los minutos declarados.
- Las filas del comprobante repartían centésimas con el resto más grande. El encabezado (regular, extra, tránsito) sigue haciéndolo, para que esas tres sumen el redondeo del total. La semana y el periodo siguen siendo el redondeo de la suma, no la suma de filas ya redondeadas.
- En Solo geocerca no se escriben puntos. Hace falta **Miga de pan**. Ya estaba así desde la prueba 2.

## Qué quedó

- Al leer, un almuerzo fijo no pasa de la jornada menos las pausas. Una jornada de 36 min con 60 declarados descuenta 36. Si además hay 10 min de pausa, descuenta 26. El número guardado en la jornada no se reescribe: el tope es al calcular. Varios segmentos prorratean ese total ya topado. Un solo segmento coincide con el cálculo de la jornada entera. Si el almuerzo trae inicio y fin, se usa el intervalo, como antes.
- Guardar un almuerzo fijo más largo que la jornada se rechaza. Vale en el cierre, en editar, en la revisión de una jornada abierta, en el parche manual, al partir la jornada y en el repositorio. La jornada de la misma duración sí cabe. El aviso es «El almuerzo tiene que caber en la jornada.» / “Lunch must fit within the shift.” El tope al guardar es la duración de la jornada, no la jornada menos las pausas: 36 min de almuerzo en 36 min de jornada se aceptan, y si hay pausa el cálculo deja el almuerzo en lo que queda.
- Una fila que ya estaba así se puede anotar o borrar. No se puede acortar la jornada ni repetir el descuento de más en una escritura nueva.
- Cada jornada en el PDF (plantilla heredada y la premium) y en Historial, Reportes y el resumen de hoy muestra el redondeo de sus minutos de pago. 5 min son 0.08 h, al lado de «5 min». Esas cadenas no entran en el hash.
- El expediente `W2026-10-19-474e0ac3` se verifica igual. No se toca su statement ni su PDF. Si se vuelve a sellar esa semana, el almuerzo de 60 min en la jornada de 36 queda topado, así que el `contentHash` nuevo no coincide con el sellado. La frescura del periodo puede decir que no cuadra: el cálculo en vivo ya aplica el tope y el sello guarda el statement de entonces. Eso es lo esperado. No hace falta resellar para que el expediente viejo siga siendo válido.

## Checklist en el teléfono

Mismo equipo (Samsung, español). Build nuevo, sin reutilizar el APK del 19 oct. **Miga de pan** puede quedarse apagado en esta pasada: no es lo que se reprueba. Anota hora y, si algo falla, una captura.

| Id | Qué hacer | Qué tiene que pasar |
| --- | --- | --- |
| I1 | Abre una jornada corta, de unos 36 min. Ciérrala y elige 60 min de almuerzo. | Avisa «El almuerzo tiene que caber en la jornada.» No cierra. El libro no gana ese cierre. |
| I2 | La misma jornada, con un almuerzo de 30 min, y otra vez con uno igual a la duración. | Las dos cierran. En la nómina el almuerzo no pasa de la jornada. |
| I3 | En una jornada ya cerrada con 60 min de almuerzo fijo, abre Editar sesión y acorta el fin por debajo de esos 60. Escribe una nota. | El fin avisa el mismo texto. Guardar no se habilita. |
| I4 | En una jornada en Revisar cuyo almuerzo fijo sea de 60 min, confirma un fin que deje la jornada en menos de 60. | No confirma. El mismo aviso. Un fin que deje la jornada en 60 min o más sí se puede guardar. |
| I5 | Cierra una jornada de 5 min, sin almuerzo. Mira Historial, Reportes y un comprobante nuevo. | La fila dice 0.08 h y 5 min. No dice 0.09. El total de la semana es el redondeo de la suma, no la suma de las filas. |
| I6 | Abre el expediente del 19 oct (`W2026-10-19-474e0ac3`) y comprueba el código. | Sigue verificando. El PDF sellado no cambia. Si la semana aparece desactualizada, es porque un cálculo nuevo topa ese almuerzo de 60 min. No reselles esa semana si quieres conservar los números del 19 oct. |
| I7 | Con **Miga de pan** apagado, mira el rastro de una jornada. | `pointCount` 0 es lo esperado. Para guardar migas, enciende **Miga de pan** antes de empezar (prueba 2, G1). |
