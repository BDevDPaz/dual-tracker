# Pruebas en el teléfono — varios destinos y traslado pagado

Para una persona, en el Samsung S22+ (o cualquier Android con ubicación). No hace falta un segundo teléfono. Jest no simula la geocerca del sistema: estos pasos sí.

Build de release (no Expo Go). Cómo instalarlo: [BUILD.md](BUILD.md). Anota fecha, modelo, versión de Android, commit y Aprobado/Fallido.

Antes de empezar: en Ajustes, el nombre y la tarifa por hora ya están guardados, y aceptaste el aviso de ubicación. La política de traslado **no tiene interruptor en pantalla**. Por defecto el trayecto entre destinos se paga a la misma tarifa (×1) y **sí cuenta** para el extra diario y semanal. El camino de casa al primer destino no se paga.

## Preparar dos destinos de prueba

Hazlo en un lugar donde puedas caminar, no en el coche.

1. Hoy → Gestionar destinos → Nuevo destino.
2. **Obra A**. Dirección real del punto donde estás. Radio **80** metros. Guarda.
3. Camina unos **200–300 metros** (más que el radio, para que no se solapen).
4. **Obra B**, dirección de ese segundo punto, radio **80** metros.
5. Vuelve a la lista. Los dos aparecen con coordenadas. Si uno dice que faltan coordenadas, edita la dirección hasta que el mapa del sistema las resuelva: sin coordenadas no hay geocerca.

Para la prueba de solape (M5), crea después **Obra C** en el mismo punto que Obra A, también con radio 80. No la uses hasta ese caso.

## M1 — Llegar al primer destino

1. Hoy → Iniciar jornada → Obra A.
2. Si ya estás dentro del radio, la geocerca a veces **no** avisa sola. Toca **Confirmar llegada**.
3. Si estás fuera, camina hasta Obra A y espera el check-in automático («Llegaste al sitio»). Si el GPS es malo, usa **Confirmar llegada**.

**Esperado:** el estado pasa a «En sitio». El temporizador corre. Cancelar jornada ya no está.

## M2 — Salir, trasladarte y llegar al segundo

1. Con la jornada en sitio, aléjate de Obra A más de 80 m y espera unos 2 minutos (la salida no es instantánea).
2. Debe abrirse «Salida detectada». La hora es la **primera** salida, no la de ahora.
3. Toca **Iniciar traslado** → Obra B.
4. El estado es «En traslado». Abajo, **Destinos de hoy** muestra Obra A y Obra B.
5. Camina hasta Obra B. Si entras en el radio y no ficha solo, toca **Confirmar llegada**.
6. El estado vuelve a «En sitio» y el nombre de arriba es Obra B. **Destinos de hoy sigue mostrando los dos.**

**Esperado:** no desaparece Obra A al llegar a Obra B. Cancelar traslado, si lo haces antes de llegar, te deja otra vez en sitio en Obra A y ese trayecto no se paga.

## M3 — Almuerzo desde la salida

1. Repite una salida (aleja de la geocerca y espera).
2. En el aviso, toca **Iniciar almuerzo** (no «Cerrar jornada»).
3. El estado es «En almuerzo». Reanudar vuelve a «En sitio».

**Esperado:** el almuerzo empieza a la hora de la primera salida. La jornada no se cierra sola a los 15 minutos.

## M4 — Cómo se ve el pago

1. Cierra la jornada. En el cierre, si no tomaste almuerzo, elige 0 minutos.
2. Abre la sesión en Historial.
3. El título es «Obra A → Obra B», no solo Obra B.
4. En las líneas hay **Tránsito** con los minutos del camino y la tarifa ×1. Esas horas están en el estimado, aparte de las horas en sitio.
5. Ficha de Obra A: la jornada aparece y «última visita» no dice «Nunca».
6. Reportes: el resumen del periodo tiene una fila **Tránsito**. El comprobante (empleado o empleador) lista «Obra A → Obra B» en el sitio del día.

**Esperado:** el trayecto no se suma otra vez como hora normal de sitio. Si el día (sitio + trayecto) pasa de 8 h, el extra sale en la línea de horas extra y el trayecto sigue en su línea. Con la tarifa ×1 el total es el mismo que pagar el tramo que se pasa de 8 h a tiempo extra.

## M5 — Dos destinos que se pisan

1. Inicia en Obra A y confirma llegada.
2. Sin salir del radio, Iniciar jornada no aplica: ya estás en sitio. Para trasladarte necesitas la salida **o** este atajo de prueba: aleja un momento, y en el aviso elige **Iniciar traslado** → Obra C (el destino encima de A).
3. Si ya estás dentro de Obra C, el teléfono puede no mandar «entrada». Toca **Confirmar llegada**.

**Esperado:** llegas a quedar «En sitio» en Obra C. No te quedas para siempre en «En traslado» solo con «Ver estado».

## M6 — Editar o archivar un destino a mitad del día

1. Jornada en sitio en Obra A.
2. Abre Obra A y cambia el radio de 80 a **150**. Vuelve a Hoy.
3. Aléjate unos 100 m (dentro de 150, fuera de 80). No debería saltar la salida.
4. Aléjate más de 150 m. Sí debería saltar.
5. Con otra jornada, archiva Obra B. El historial de Obra B no se borra. Obra B ya no sale al elegir destino de un traslado nuevo.

## M7 — La app muere en el traslado

1. Ponte «En traslado» hacia Obra B.
2. Ajustes del sistema → aplicaciones → Dual Tracker → Forzar detención.
3. Espera al menos un minuto y abre la app.

**Esperado:** sigues en traslado hacia Obra B (no se duplica la jornada). Puede salir el aviso de que el sistema cerró la app. **Confirmar llegada** sigue disponible. En el detalle de la sesión, la línea de tiempo tiene «App cerrada por el sistema».

## M8 — Medianoche (si puedes dejar el teléfono)

1. Inicia en Obra A por la noche y, si da tiempo, trasládate a Obra B antes de las 00:00.
2. Justo después de medianoche abre Hoy.

**Esperado:** la jornada sigue abierta y **Destinos de hoy** no se vacía. Al cerrar, en Reportes el tránsito que cruzó las 00:00 se reparte entre los dos días (política v2).

## Registro

| Caso | Fecha | Modelo | Android | Commit | Resultado | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| M1 Llegada | | | | | | |
| M2 Dos destinos | | | | | | |
| M3 Almuerzo desde la salida | | | | | | |
| M4 Historial, reportes y PDF | | | | | | |
| M5 Geocercas solapadas | | | | | | |
| M6 Editar radio / archivar | | | | | | |
| M7 App cerrada por el sistema | | | | | | |
| M8 Medianoche | | | | | | |
