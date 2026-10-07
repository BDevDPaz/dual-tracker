# Pruebas en dispositivo — FieldCryptoService v1.3 (matriz §18, D1–D15)

Esta matriz es **obligatoria** antes de liberar el cifrado de campos. Jest (Node + sql.js + dobles) no ejecuta Hermes, el llavero de iOS, el Keystore de Android ni tareas reales en segundo plano, así que estas pruebas no se pueden automatizar en la suite.

## Requisitos

- **Build de release** (Hermes activado). No sirve Expo Go ni un build de desarrollo. Se obtiene con el perfil `preview` de EAS (`npm run build:android:preview` / `npm run build:ios:preview`); cómo compilar e instalar en Android y en iPhone: [BUILD.md](BUILD.md).
- **Equipos**:
  - Al menos un Android real de gama baja con **Android 10 o superior**.
  - El **iPhone más antiguo que soporte la app**.
  - D12 se hace en un navegador (web).
- **Datos de la app**:
  - Paquete / bundle: `com.bdevdpaz.dualtracker`.
  - Base de datos: `dual_tracker_v1.db`, en `files/SQLite/` en Android y en `Documents/SQLite/` en iOS.
- **Cómo extraer la base**:
  - Android: con una variante *debuggable* del build de release (o un emulador), ejecutar `adb exec-out run-as com.bdevdpaz.dualtracker cat files/SQLite/dual_tracker_v1.db > dt.db` y abrir el archivo con `sqlite3 dt.db`.
  - iOS: Xcode → Window → Devices and Simulators → la app → *Download Container…*.
- **Consultas útiles** (en `sqlite3`):
  ```sql
  -- Nada en claro fuera de los asientos v1 del ledger:
  SELECT id, manual_note_sealed FROM sessions WHERE manual_note_sealed IS NOT NULL AND manual_note_sealed NOT LIKE 'enc:v1:%';
  SELECT id, alias, client_name, address, notes, target_coords_enc, target_lat, target_lon FROM sites;
  SELECT COUNT(*) FROM spatial_facts WHERE coords_sealed NOT LIKE 'enc:v1:%';
  SELECT COUNT(*) FROM spatial_facts WHERE coords_sealed LIKE 'plain:v1:%';
  SELECT key, value FROM app_kv WHERE key IN ('settings.company','runtime.last_fix','crypto.kids','crypto.active_kid','crypto.backfill.v3','crypto.sweep.v1');
  SELECT id, intent, reason, payload_json FROM ledger_entries WHERE intent IN ('CERT_BLOCKER_ADDED','PACK_SHARED') ORDER BY id;
  SELECT cert_blockers_json FROM sessions WHERE cert_blockers_json IS NOT NULL;
  ```
- **Build de prueba para D11**: compilar con la variable de entorno `EXPO_PUBLIC_DT_FORCE_KEYSTORE_FAILURE=1`, que hace fallar el llavero. **No usar nunca en producción.** Se hace con el perfil `preview-d11` (`npm run build:android:d11` / `npm run build:ios:d11`), que instala una app aparte, «Dual Tracker D11» (`com.bdevdpaz.dualtracker.d11`); la config rechaza la bandera en cualquier otra variante. Ver [BUILD.md → Build de D11](BUILD.md#build-de-d11-llavero-forzado-a-fallar).

## Vector fijo (D1)

El mismo vector está en `src/services/persistence/__tests__/FieldCryptoService.test.ts` (`KAT`), así que Jest lo comprueba en cada ejecución.

| Campo | Valor |
| --- | --- |
| Clave (hex, 32 bytes) | `000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f` |
| IV (base64url, 12 bytes) | `oKGio6Slpqeoqaqr` |
| AAD (UTF-8) | `dt-fc\|v1\|k1\|session.note\|42` |
| Texto | `Llegué tarde por tráfico 🚧` |
| Sobre esperado | `enc:v1:k1:session.note:oKGio6Slpqeoqaqr:qnQZSjAIq58WBPW3YlqwsQKMLWJRFiQF_2EGduAx0kSLcyYB5TzEvnwWD5NisVI` |

## Registro de ejecución

Para cada caso y cada plataforma, rellena una fila:

| Campo | Qué anotar |
| --- | --- |
| Fecha | AAAA-MM-DD |
| Modelo | p. ej. Moto E13 / iPhone XR |
| Versión de SO | p. ej. Android 13 / iOS 17.5 |
| Build | versión de la app y commit |
| Resultado | Aprobado / Fallido |
| Evidencia / notas | capturas, consultas SQL, tiempos medidos |

---

## D1 — Vector fijo (Android + iOS)

**Pasos**
1. En un build de prueba, cifra el vector de arriba con la clave, el IV y la AAD fijos (rowId 42) y compara el sobre con el de Jest.
2. Al revés: descifra en el equipo el sobre esperado.

**Esperado:** bytes idénticos en ambos sentidos.
**Criterio de aprobación:** coincidencia exacta.

| Plataforma | Fecha | Modelo | SO | Build | Resultado | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| Android | | | | | | |
| iOS | | | | | | |

## D2 — Ida y vuelta masiva (Android + iOS)

**Pasos**
1. Genera 1.000 notas y 1.000 alias aleatorios de 0 a 2.000 caracteres, con emoji, acentos y ñ.
2. Cifra y descifra cada uno (`session.note` y `site.alias`, con rowIds distintos).

**Esperado:** todo descifra igual al original.
**Criterio de aprobación:** 0 diferencias.

| Plataforma | Fecha | Modelo | SO | Build | Resultado | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| Android | | | | | | |
| iOS | | | | | | |

## D3 — Rendimiento (Android + iOS)

**Pasos**
1. Mide 1.000 × `encryptJson("spatial.coords")`.
2. Mide 1.000 × `insertSpatialFact` completo (INSERT + encrypt + UPDATE).
3. Crea 200 destinos y mide `listSites` (descifrar + ordenar en memoria).

**Esperado:** costo acotado, con la clave en caché.
**Criterio de aprobación** (en el Android de gama baja):
- p95 de encrypt ≤ 5 ms.
- p95 de inserción ≤ 25 ms.
- `listSites` ≤ 150 ms.

| Plataforma | Fecha | Modelo | SO | Build | p95 encrypt | p95 inserción | listSites | Resultado |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Android | | | | | | | | |
| iOS | | | | | | | | |

## D4 — iPhone bloqueado con la jornada abierta (iOS)

**Pasos**
1. Inicia una jornada en un destino con geocerca.
2. Bloquea el iPhone.
3. Sal de la geocerca caminando y espera 10 minutos.
4. Desbloquea y extrae la base.

**Esperado:** el EXIT queda cifrado y no aparece ningún bloqueo de certificación.
**Criterio de aprobación:**
- 0 filas `plain:v1:`.
- Ningún asiento `CERT_BLOCKER_ADDED`.

| Fecha | Modelo | SO | Build | Resultado | Notas |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

## D5 — Reinicio sin desbloquear (iOS)

**Pasos**
1. Con la jornada abierta, reinicia el iPhone y **no** lo desbloquees.
2. Cambia de ubicación (sal de la geocerca).
3. Desbloquea y abre la app.

**Esperado:**
- No hay escrituras antes del primer desbloqueo.
- Se recupera por la vía OS_KILL.

**Criterio de aprobación:**
- 0 filas `plain:v1:`.
- Ningún cierre por error.

| Fecha | Modelo | SO | Build | Resultado | Notas |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

## D6 — Pantalla bloqueada y Doze (Android)

**Pasos**
1. Inicia una jornada con geocerca y bloquea la pantalla.
2. Ejecuta `adb shell dumpsys deviceidle force-idle`.
3. Sal de la geocerca.
4. Ejecuta `adb shell dumpsys deviceidle unforce`, desbloquea y extrae la base.

**Esperado:**
- La tarea headless descifra `runtime.last_fix` y el alias para la notificación.
- El EXIT se escribe cifrado.

**Criterio de aprobación:**
- 0 filas `plain:v1:`.
- El EXIT está presente.
- La notificación muestra el alias correcto.

| Fecha | Modelo | SO | Build | Resultado | Notas |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

## D7 — Reinicio con la jornada abierta (Android)

**Pasos**
1. Con la jornada abierta, reinicia el equipo.
2. Desbloquéalo y espera a `RECEIVE_BOOT_COMPLETED`.
3. Muévete para generar hechos nuevos y extrae la base.

**Esperado:** las tareas se reanudan con la clave.
**Criterio de aprobación:**
- Los hechos nuevos están cifrados (`enc:v1:`).
- Salud no muestra KEY_MISSING.

| Fecha | Modelo | SO | Build | Resultado | Notas |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

## D8 — La app muere durante la jornada (Android + iOS)

**Pasos**
1. Con la jornada abierta, fuerza el cierre de la app (desde el sistema).
2. Vuelve a abrirla.

**Esperado:**
- Aparece el aviso OS_KILL.
- Los sobres siguen siendo legibles (notas y rastro visibles).

**Criterio de aprobación:** `crypto.kids` no cambia (compara la consulta de antes y la de después).

| Plataforma | Fecha | Modelo | SO | Build | Resultado | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| Android | | | | | | |
| iOS | | | | | | |

## D9 — Respaldo y restauración en un equipo nuevo (Android + iOS)

**Pasos**
1. En el equipo A, crea un historial con notas, rastro y destinos, y sella y verifica un expediente.
2. Haz el respaldo del sistema (iCloud / Google).
3. Restaura en el equipo B y abre la app.

**Esperado:**
- Salud muestra exactamente: «Datos cifrados ilegibles en este dispositivo — Se restauró el historial sin su clave de cifrado. Las horas y la certificación de las jornadas se conservan, pero las notas y ubicaciones anteriores no se pueden leer aquí.»
- Las notas aparecen como «— (ilegible en este dispositivo)».
- La vista de rastro dice «Rastro ilegible en este dispositivo.».
- Los destinos dicen «Datos del destino ilegibles en este dispositivo. Vuelve a capturar el destino.».
- Las clases de integridad y la certificación no cambian, y las horas son iguales.
- El pack sellado verifica y al volver a sellarlo se **reutiliza**.
- Una jornada nueva escribe con `k2` (`enc:v1:k2:`).
- Un periodo sin pack se sella con la advertencia «Advertencia: en el dispositivo que emitió este expediente, las notas y ubicaciones de algunas jornadas no eran legibles. Las horas y la integridad no se ven afectadas.» en el PDF y en el detalle del pack.

**Criterio de aprobación:**
- Se observa todo lo anterior.
- El slot `dt.mk.k1` nunca se escribe en el equipo B.

| Plataforma | Fecha | Modelo A → B | SO | Build | Resultado | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| Android | | | | | | |
| iOS | | | | | | |

## D10 — Respaldo cifrado restaurado en el mismo iPhone (iOS)

**Pasos**
1. Haz un respaldo **cifrado** (Finder/iTunes o iCloud) de un iPhone con datos.
2. Restáuralo en el **mismo** iPhone.

**Esperado:** documentar el resultado; se espera READY, porque el llavero *ThisDeviceOnly* vuelve en el mismo equipo.
**Criterio de aprobación:** queda registrado y es coherente con §14 (si sale KEY_MISSING, debe comportarse como en D9).

| Fecha | Modelo | SO | Build | Estado observado | Resultado | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | | | |

## D11 — Llavero forzado a fallar (Android + iOS)

**Pasos** (build con `EXPO_PUBLIC_DT_FORCE_KEYSTORE_FAILURE=1`: perfil `preview-d11`, app «Dual Tracker D11», paquete `com.bdevdpaz.dualtracker.d11`)
1. **(a)** Jornada sin notas y sin rastro: iníciala y ciérrala.
2. **(b)** Jornada con nota y con miga de pan: iníciala, añade una nota y camina para generar miga; luego ciérrala.
3. Intenta añadir una nota a una jornada cerrada.

**Esperado:**
- (a) Sin bloqueo.
- (b) Bloqueo `FIELD_CRYPTO_UNAVAILABLE` y badge «No certificable». La clase **no** pasa a CONFLICT.
- Salud muestra «Cifrado de campos no disponible — Las notas y ubicaciones que se registren se guardarán sin cifrar y esas jornadas no se podrán certificar.».
- La nota sobre la jornada cerrada se rechaza con un mensaje claro.

**Criterio de aprobación:**
- Los resultados de (a) y (b) son exactamente los esperados.
- La app no se cae.

| Plataforma | Fecha | Modelo | SO | Build | (a) | (b) | Resultado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Android | | | | | | | |
| iOS | | | | | | | |

## D12 — Web (navegador)

**Pasos**
1. Abre la app en el navegador (`npx expo start --web` o el despliegue web).
2. Inicia una jornada con nota.

**Esperado:**
- Aparece el aviso «La versión web no admite jornadas certificadas porque no puede proteger notas ni ubicaciones. Usa la app en Android o iOS.» en Hoy y en Salud.
- La jornada queda bloqueada para certificación.

**Criterio de aprobación:**
- La microcopy es exacta.
- Ninguna jornada es certificable.

| Navegador | Fecha | SO | Build | Resultado | Notas |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

## D13 — Actualización desde 8df2b9a (Android + iOS)

**Pasos**
1. Instala el build de **8df2b9a** (firmado con el mismo keystore de EAS que el nuevo; ver [BUILD.md](BUILD.md#android-build-de-prueba-apk-e-instalación)) y crea datos: destinos, jornadas con notas y pausas, rastro y un pack.
2. Actualiza al build nuevo **sin desinstalar** y abre la app.
3. Extrae la base.

**Esperado:**
- El backfill se ejecuta.
- `target_lat`/`target_lon` quedan en NULL.
- Alias, cliente, dirección, notas y rastro quedan en `enc:v1:`.
- Las pausas se reconstruyen.
- Los asientos v1 del ledger quedan intactos.

**Criterio de aprobación:** el SELECT crudo no muestra el texto de prueba en ningún sitio salvo en los asientos v1 del ledger.

| Plataforma | Fecha | Modelo | SO | Build | Resultado | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| Android | | | | | | |
| iOS | | | | | | |

## D14 — Migración del alias antiguo de la clave (Android + iOS)

**Pasos**
1. Parte de una instalación que tenga la clave en el alias antiguo `dualtracker.fieldcrypto.key.v1` (builds anteriores a C1; si no existe, créalo a mano en un build de prueba con 32 bytes en hex).
2. Actualiza y abre la app.

**Esperado:** `dt.mk.k1` contiene los mismos bytes que el alias antiguo y el alias antiguo se borra.
**Criterio de aprobación:** queda un solo slot y la lectura de los datos previos es correcta.

| Plataforma | Fecha | Modelo | SO | Build | Resultado | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| Android | | | | | | |
| iOS | | | | | | |

## D15 — Recomendación de copia (Android + iOS)

**Pasos**
1. Sella un periodo. En Reportes y en el detalle del pack aparece la tarjeta «Guarda una copia del expediente de cada periodo fuera del teléfono (correo o Archivos). Si cambias de teléfono, el respaldo del sistema recupera tus horas, pero no las notas ni las ubicaciones.».
2. Compártelo (empleado o empleador).
3. Vuelve a Reportes y a Salud.

**Esperado:** la tarjeta desaparece para ese pack y la fila «Copia de expedientes: {n} periodo(s) sin exportar.» baja en uno.
**Criterio de aprobación:**
- Hay un asiento `PACK_SHARED` en el ledger.
- La UI es coherente.

| Plataforma | Fecha | Modelo | SO | Build | Resultado | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| Android | | | | | | |
| iOS | | | | | | |

---

## Idioma (Español / English)

La política de qué se traduce y qué queda sellado está en [IDIOMA.md](IDIOMA.md). En un Android real, con el APK de `preview`:

1. Borra los datos de la app. Con el sistema en English la bienvenida sale en inglés; con el sistema en español, en español. Otro idioma del sistema cae a español.
2. En Ajustes pulsa **English** (sin Guardar). Al momento cambian las cuatro pestañas, los títulos, Hoy, Historial, Reportes, pastillas («Not certifiable», «Validated»), Salud, modales y el texto de tirar para actualizar.
3. Fechas en inglés (`Mon, Oct 5, 2026`) y rangos `Mon, Oct 5, 2026 – Sun, Oct 11, 2026`. Al volver a Español: `lun, 5 oct 2026 – dom, 11 oct 2026`. Los importes siguen `$12.50`.
4. Cierra la app desde recientes y ábrela: sigue el idioma elegido.
5. Con jornada abierta, la notificación persistente y, si sales del sitio, el aviso y sus botones están en ese idioma.
6. El PDF de un expediente nuevo sigue en español, y uno ya compartido no cambia al cambiar el idioma.

| Plataforma | Fecha | Modelo | SO | Build | Resultado | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| Android | | | | | | |

---

## Cierre

| Plataforma | Todos los casos aprobados | Responsable | Fecha |
| --- | --- | --- | --- |
| Android (gama baja, Android 10+) | ☐ | | |
| iPhone (el más antiguo soportado) | ☐ | | |
| Web (D12) | ☐ | | |

---

## Jornada con varios destinos y traslado pagado

Lista para el teléfono (un solo operario, sin segundo equipo): [PRUEBAS_MULTI_DESTINO.md](PRUEBAS_MULTI_DESTINO.md).

Qué hace el código hoy, qué se corrigió y qué decisiones quedan abiertas: [AUDITORIA_DESTINOS_Y_TRASLADO.md](AUDITORIA_DESTINOS_Y_TRASLADO.md).
