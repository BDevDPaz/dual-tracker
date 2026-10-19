# Tanda 2 — checklist de teléfono

Build de desarrollo, sin APK de tienda. Español al empezar. Anota versión, compilación y guía `soporte.v3`.

No hace falta portal real ni clave de mapas. El código de PIN se genera en un ordenador con `npx tsx scripts/provision-admin-pin.ts --pin …… --hours 1` y se pega en el teléfono. El PIN se dice aparte: no está dentro del código.

| Caso | Pasos | Esperado |
| --- | --- | --- |
| T1 | Ajustes, zona admin, teléfono nuevo. | Se lee «PIN local (no aprovisionado por empleador)». Se puede guardar un PIN de al menos 6 caracteres. |
| T2 | Con el PIN local puesto, tres PIN malos. | El teléfono espera (primer escalón, 30 s). Un cuarto intento antes de tiempo no abre la zona. |
| T3 | Pega un código caducado o recortado. | No cambia el PIN. Aviso de código no válido o caducado. |
| T4 | Pega un código vigente. El PIN de verdad lo escribes al desbloquear. | La etiqueta pasa a PIN del empleador. El mismo código, pegado otra vez, se rechaza. |
| T5 | Sin desbloquear, intenta otro código de empleador. | Se rechaza: ya hay un PIN del empleador. |
| T6 | Desbloquea, guarda un PIN a mano y bloquea. | La etiqueta vuelve a PIN local. |
| T7 | Ajustes, sin haber escrito una dirección. | Se lee «Portal del empleador: no configurado». La cola puede estar vacía. Nada sale del teléfono (modo avión da igual: no hay envío). |
| T8 | Desbloquea e intenta guardar `http://…` o encender el envío sin https. | No se guarda. El aviso pide https. |
| T9 | Reportes: semana actual, semana anterior, quincena, mes. | El subtítulo cambia. Quincena es 1–15 o 16–fin de mes. Mes es el mes civil. |
| T10 | Personalizado: fin anterior al inicio, y luego un rango de más de un año. | Aviso de orden y aviso de rango demasiado largo. No aparece un resumen falso. |
| T11 | Un rango que cubre dos semanas con jornadas cerradas. | Aviso de que las horas extra van por semana. Cada semana tiene su botón de sellar. La suma de arriba no es un sello único. |
| T12 | Sella una sola semana (semana actual con jornadas cerradas). | Un solo botón de generar, como antes. El expediente abre el detalle. |
| T13 | Abre el rastro de una jornada con miga, en modo avión. | Hay un plano (línea, círculo del sitio, norte, escala). No pide red ni muestra calles. |
| T14 | En ese plano pellizca o usa + / − / 1. | Se acerca, se aleja y vuelve al tamaño. |
| T15 | Jornada solo de geocerca, sin miga. | El plano puede no salir. La lista lo dice. No se inventa un camino. |
| T16 | Soporte, preguntas del PIN, del portal, del rango y del plano. English y otra vez Español. | Las cuatro existen en los dos idiomas y cambian en el acto. La línea de versión dice `soporte.v3`. |
| T17 | Comparte el diagnóstico y ábrelo. | No hay dirección del portal, ni coordenadas, ni PIN. Puede decir `unconfigured`, `disabled` o `enabled`. |

| Caso | Fecha | Modelo | SO | Build | Resultado | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| T1 | | | | | | |
| T2 | | | | | | |
| T3 | | | | | | |
| T4 | | | | | | |
| T5 | | | | | | |
| T6 | | | | | | |
| T7 | | | | | | |
| T8 | | | | | | |
| T9 | | | | | | |
| T10 | | | | | | |
| T11 | | | | | | |
| T12 | | | | | | |
| T13 | | | | | | |
| T14 | | | | | | |
| T15 | | | | | | |
| T16 | | | | | | |
| T17 | | | | | | |
