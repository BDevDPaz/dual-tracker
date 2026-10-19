# Pruebas en el teléfono — fichaje automático (Samsung Galaxy S22+)

Para Byron, en el **Samsung Galaxy S22+** (One UI) con el APK preview de EAS. Jest no enciende el GPS ni la geocerca de Android: estos pasos sí.

Cómo instalar el build de release: [BUILD.md](BUILD.md). El modo «Solo geocerca» (el de fábrica) ya basta: el servicio en primer plano sigue tomando muestras y, si el aviso del sistema no llega, esas muestras fichan. No hace falta cambiar a «Rastro».

Relacionado: [varios destinos](PRUEBAS_MULTI_DESTINO.md) y [cifrado](PRUEBAS_DISPOSITIVO.md).

## Antes de salir

En **Salud** (Ajustes → Salud operativa), con una jornada abierta, tiene que verse:

| Fila | Tiene que decir |
| --- | --- |
| Ubicación en uso | Concedido |
| Ubicación en segundo plano | Concedido. En el ajuste de Android es **Permitir todo el tiempo**, no «Solo mientras se usa». |
| Notificaciones | Concedido |
| Servicio en primer plano | En curso |
| Batería sin restricciones | Sin restricciones |
| Geocerca activa | OK |

Si la batería está restringida, pulsa Reparar y en Ajustes de Samsung deja Dual Tracker en **Sin restricciones** (y fuera de Apps en suspensión / suspensión profunda).

Prepara dos destinos reales, separados más de 300 m, con coordenadas (si falta el mapa, edita la dirección hasta que resuelva). Radio de cada uno **100 m o más**. En Android el sistema no vigila bien radios menores: si pones 80, la app registra 100 en el sistema y decide con el radio que guardaste.

## Cómo leer el diagnóstico

En **Salud**, sección **Diagnóstico de geocerca**. Son los últimos eventos de este teléfono. **No guarda coordenadas**: hora, tipo (Entrada, Salida, Muestra, Registro, Error), región (`SESSION_…_SITE_…`), precisión en metros, y Aceptado o Rechazado con el motivo.

Qué anotar si algo falla: una captura de esas filas, la hora y el sitio.

| Lo que ves | Qué significa |
| --- | --- |
| Registro rechazado, «Sin permiso de ubicación» o «Ubicación del sistema apagada» | No hay geocerca. Arregla el permiso o el GPS. |
| Registro aceptado, «Falta permitir la ubicación todo el tiempo» | Con la pantalla apagada el fichaje puede no llegar. En el ajuste de la app: Permitir todo el tiempo. |
| Entrada rechazada, «Precisión mayor que el radio» | El GPS está peor que el radio del sitio. Sal al aire libre o sube el radio. No ficha solo. |
| Entrada rechazada, «Salto de ubicación imposible» | El salto no cuadra con el tiempo (posible GPS basura). La siguiente muestra buena puede fichar. |
| Salida rechazada, «Salida inmediata tras llegar» | Rebote de Android al registrar estando ya dentro. La jornada **no** se cierra a los 0 minutos. |
| Salida rechazada, «Sigue dentro del radio» o «En la banda de histéresis» | Aún no estás bastante lejos. Aléjate más. |
| Muestra aceptada, «Muestra dentro del sitio» | El ENTER del sistema no llegó y la muestra del servicio fichó igual. |
| Muestra aceptada, «Traslado al sitio detectado» | Llegaste a otro destino guardado: sigue **la misma** jornada. |
| Entrada aceptada, «Ya estaba dentro al registrar» | Abriste la jornada estando ya en el sitio y fichó sin esperar al aviso del sistema. |

## G1 — Llegar (ya estás en el sitio)

1. Ponte en el destino, al aire libre.
2. Hoy → Iniciar jornada → ese destino.
3. Espera hasta un minuto sin caminar.

**Esperado:** pasa a «En sitio» solo, sin pulsar Confirmar llegada. En el diagnóstico hay una Entrada aceptada («Ya estaba dentro al registrar») o una Muestra aceptada («Muestra dentro del sitio»).

| Fecha | Modelo | Android | Commit | Resultado | Notas |
| --- | --- | --- | --- | --- | --- |
| | Galaxy S22+ | | | | |

## G2 — Llegar caminando o en la van

1. Inicia la jornada **fuera** del radio (a más de 200 m).
2. Entra al sitio en coche, a velocidad normal, y para.
3. Espera hasta 2 minutos.

**Esperado:** «En sitio» sin ajuste manual. Una entrada en coche ya no se rechaza por ir a más de 15 km/h.

| Fecha | Modelo | Android | Commit | Resultado | Notas |
| --- | --- | --- | --- | --- | --- |
| | Galaxy S22+ | | | | |

## G3 — No se cierra al minuto de llegar

1. Inicia la jornada estando ya en el sitio (G1) y quédate ahí 3 minutos.
2. No te alejes.

**Esperado:** sigue «En sitio». No aparece un cierre de 0.00 h ni «Cierre automático» a la misma hora de inicio. Si el diagnóstico muestra «Salida inmediata tras llegar», está rechazada y la jornada sigue abierta.

| Fecha | Modelo | Android | Commit | Resultado | Notas |
| --- | --- | --- | --- | --- | --- |
| | Galaxy S22+ | | | | |

## G4 — Salir de verdad

1. Con la jornada en sitio desde hace más de 2 minutos, aléjate **más allá del radio + 50 m** (con radio 100 m, a unos 200 m del punto). No basta con cruzar el borde: ahí el GPS rebota.
2. Espera unos 2 minutos (la salida no es instantánea).

**Esperado:** aviso «Salida detectada». La hora es la **primera** salida. La jornada no se cierra sola al momento: puedes seguir, trasladarte o cerrar.

| Fecha | Modelo | Android | Commit | Resultado | Notas |
| --- | --- | --- | --- | --- | --- |
| | Galaxy S22+ | | | | |

## G5 — Dos destinos, una sola jornada

1. Haz G4 en el primer destino.
2. Ve al segundo (más de 300 m). No pulses «Iniciar jornada» otra vez.
3. Si sale el aviso de salida, puedes pulsar Iniciar traslado, o simplemente entrar al segundo sitio y esperar un minuto.

**Esperado:** sigues en **la misma** jornada. El estado vuelve a «En sitio» con el nombre del segundo destino. «Destinos de hoy» muestra los dos. Al cerrar, Historial titula «A → B» y hay una línea de tránsito. No aparecen dos sesiones sueltas de ese día.

| Fecha | Modelo | Android | Commit | Resultado | Notas |
| --- | --- | --- | --- | --- | --- |
| | Galaxy S22+ | | | | |

## G6 — Pantalla apagada

1. Jornada en sitio. Bloquea el teléfono.
2. Aléjate como en G4. Espera 3 minutos. Desbloquea.

**Esperado:** la salida quedó registrada (aviso o estado «Salida detectada»). En el diagnóstico hay una Salida o una Muestra aceptada con hora de mientras estaba bloqueado.

| Fecha | Modelo | Android | Commit | Resultado | Notas |
| --- | --- | --- | --- | --- | --- |
| | Galaxy S22+ | | | | |

## G7 — La app muere

1. Jornada en sitio o en traslado.
2. Ajustes → Aplicaciones → Dual Tracker → Forzar detención.
3. Espera un minuto, abre la app y muévete.

**Esperado:** no se duplica la jornada. Geocerca activa vuelve a OK. El diagnóstico muestra un Registro nuevo. Llegar o salir sigue fichando.

| Fecha | Modelo | Android | Commit | Resultado | Notas |
| --- | --- | --- | --- | --- | --- |
| | Galaxy S22+ | | | | |

## Qué Android sigue sin poder prometer

- El aviso de geocerca puede tardar minutos si el teléfono entra en Doze o Samsung tiene la app en suspensión profunda. Las muestras del servicio en primer plano cubren ese hueco mientras la notificación «Jornada en curso» sigue visible.
- «Solo mientras se usa la app» no ficha con la pantalla apagada.
- Si la precisión es peor que el radio del sitio, no hay fichaje automático: hay que confirmar a mano o ampliar el radio.
- El camino de casa al **primer** destino no se paga. El trayecto entre destinos de la misma jornada sí.
- Hay un tope de 20 destinos vigilados a la vez (Android permite 100; no hace falta más).
