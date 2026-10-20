# Valores provisionales

Todas las cifras que la propuesta dejó como ejemplo, o que una tanda fijó a la espera de confirmarlas, están en `src/config/provisional.ts`. El resto del código las importa. No las vuelve a escribir.

La prueba `src/config/__tests__/provisionalGuard.test.ts` falla si alguna de esas constantes se declara otra vez (`const NOMBRE =`) o si se copia una de las expresiones vigiladas.

Cada entrada del módulo tiene unidad, motivo y fuente. Esta tabla es el mismo catálogo.

| Id | Valor | Unidad | Por qué está así | Fuente |
| --- | --- | --- | --- | --- |
| `pin.attemptDelayMs` | 650 | ms | Frena la fuerza bruta antes de responder | GEOTrack, 650 ms. Técnica §4.8 pide retardo sin cifra |
| `pin.hashIterations` | 1000 | rondas | Solo verifica un PIN guardado antes de scrypt. Si coincide, se reescribe | Técnica §4.8. Migración transparente |
| `pin.scryptN` | 16384 | factor N (potencia de 2) | Unos 50 ms y 16 MB en el host de pruebas. En un Android de gama media, JS puro, cerca de 250–500 ms. No bajarlo | Tanda 2, endurecimiento. RFC 7914 |
| `pin.scryptR` | 8 | factor r | Tamaño de bloque. La memoria es del orden de 128·N·r bytes | RFC 7914 |
| `pin.scryptP` | 1 | factor p | Un solo PIN, sin paralelismo | RFC 7914 |
| `pin.scryptDkLen` | 32 | bytes | Longitud de la clave derivada | RFC 7914 |
| `pin.minLength` | 6 | caracteres | Sustituye el demo de 4 dígitos | Técnica §4.8 y Producto §4 |
| `pin.lockoutSteps` | 3→30 s, 5→5 min, 8→30 min, 10→24 h | fallos → espera | Escalera progresiva | Técnica §4.8 sin cifras. Se conservan los escalones ya usados |
| `pin.adminUnlockTtlMs` | 10 min | ms | La zona admin caduca | Técnica §4.8 |
| `pin.provisionDefaultTtlMs` | 72 h | ms | Caducidad del código si el script no recibe `--hours` | Tanda 2. No hay servidor que revoque |
| `breadcrumb.profiles` | En sitio 5 min / 50 m; traslado 30 s / 25 m; espera 2 min / 100 m | ms y metros | Más lento dentro, más frecuente en traslado | Técnica §5.4 sin cifras. Ajustar tras pruebas de batería |
| `breadcrumb.gapFactor` | 2 | veces el intervalo en sitio | Por encima de esto el mapa no inventa el tramo | Tanda 2 |
| `sites.destinationLimit` | 20 | destinos activos | Tope por dispositivo | Producto §5.5 nombra el límite y no fija el número |
| `heartbeat.gapMs` | 45 min | ms | Hueco sin lectura dentro del sitio → jornada por revisar | Tanda 1 |
| `exit.debounceMs` | 2 min | ms | Debounce antes de tratar la salida como real. La empresa puede cambiarlo | Técnica §4.3 («hoy ~2 min») |
| `exit.decisionWindowMs` | 15 min | ms | Plazo para decidir tras la primera salida | GEOTrack 15 min. Técnica §7.2 no fija la cifra |
| `clock.driftThresholdMs` | 3 min | ms | Un salto del reloj local pasa a Revisar. La hora de red solo avisa si varias muestras coinciden | Técnica §5.1. Prueba de campo 19 oct 2026 |
| `clock.hostAgreementMs` | 5 s | ms | Las dos cabeceras `Date` tienen que coincidir | Tanda 1 |
| `clock.maxSampleRttMs` | 1,5 s | ms | Por encima se descarta la muestra. El desfase usa el punto medio | Prueba de campo 19 oct 2026 |
| `clock.sampleMinIntervalMs` | 60 s | ms | No hay ráfaga al volver a primer plano ni en cada evento de geocerca | Prueba de campo 19 oct 2026 |
| `clock.driftConfirmSamples` | 3 | muestras | Todas por encima del umbral y del mismo signo | Prueba de campo 19 oct 2026 |
| `clock.driftConfirmSpanMs` | 90 s | ms | Esas muestras tienen que cubrir al menos este lapso | Prueba de campo 19 oct 2026 |
| `clock.driftConsistencyMs` | 60 s | ms | Si el desfase oscila más que esto, no se anota deriva | Prueba de campo 19 oct 2026 |
| `retention.days` | 90 | días | Mínimo tras el fin del periodo exportado | Técnica §5.4 («por ejemplo 90 días»). Hacen falta las dos condiciones |
| `reports.maxRangeMs` | 366 días | ms | Tope del rango libre, para cubrir un bisiesto | Tanda 2 |
| `portal.backoffBaseMs` | 30 s | ms | Primera espera tras un fallo de envío | Tanda 2 |
| `portal.backoffCapMs` | 6 h | ms | Tope de la espera | Tanda 2 |
| `portal.maxAttempts` | 8 | intentos | Después el ítem no se reintenta solo | Tanda 2 |
| `portal.timeoutMs` | 20 s | ms | Corte de la petición | Tanda 2 |

Los módulos antiguos (`src/constants/security.ts`, `src/constants/geolocation.ts`, `src/constants/tasks.ts` y `TimeAuthorityService`) reexportan algunos nombres para no romper imports. La cifra no está ahí.
