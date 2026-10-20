# Confiabilidad de nómina — tanda 1

Qué cambió en el teléfono para que una jornada no se cierre con horas inventadas, para que VALIDADA dependa solo de lo que de verdad la sostiene, y para que el expediente se pueda comprobar.

La nómina (minutos, tramos, importes) no se tocó.

## Decisiones

1. **Jornada huérfana.** Si el heartbeat lleva más que el hueco (`HEARTBEAT_GAP_MS`, 45 min, en `src/constants/tasks.ts`) y no hay una lectura dentro del sitio, la jornada pasa a Revisar con motivo `ORPHAN_SESSION`. Sigue abierta. No se cierra a las 12 h mientras ese motivo esté puesto. El operario confirma la hora de fin (nota obligatoria) o sigue. El paso queda en el ledger (`MARK_ORPHAN`, `CONTINUE_ORPHAN`, `CONFIRM_ORPHAN_END`). Un heartbeat que nunca existió no cuenta como hueco.
2. **Qué bloquea VALIDADA.** Ubicación en uso, ubicación en segundo plano, servicios de ubicación del sistema, servicio en primer plano (solo con jornada abierta) y reloj. Batería, notificaciones, red, geocerca y el último hecho espacial solo avisan. La tabla está en `src/core/healthPolicy.ts`. Salud la muestra en cada fila.
3. **Hora de red.** Con red se leen las cabeceras `Date` de dos sitios (`generate_204` de Google y `cdn-cgi/trace` de Cloudflare). Si concuerdan (a 5 s) se guarda el desfase. Sin red, o si las dos fuentes no concuerdan, no se bloquea por este camino. Se mide en primer plano y en las tareas de geocerca, miga de pan y vigilante. Desde la prueba de campo del 19 oct 2026 una muestra de red ya no deja la jornada en Revisar por sí sola: hace falta un desfase coherente en varias lecturas, se anota una vez, y con ubicación buena es un aviso. El salto del reloj del teléfono sí sigue bloqueando. Ver [docs/PRUEBA_CAMPO_1.md](PRUEBA_CAMPO_1.md).
4. **Firma del manifiesto.** Ed25519 (`@noble/ed25519` + SHA-512 de `@noble/hashes`, sin WebCrypto). La clave se crea una vez y vive en el llavero (`dt.packsig.ed25519.v1`), aparte de la clave de cifrado de campos. El pack lleva `algorithm`, `keyId` y la clave pública. `packHash` y `contentHash` significan lo mismo que en v3: la firma no entra. Si el llavero no está, el sello sigue y el manifiesto avisa `PACK_UNSIGNED`. Los packs viejos verifican como `unsigned-v1`. El PDF ya sellado no se reescribe.
5. **Retención.** Una miga se borra solo si cada periodo sellado que la cubre ya cumplió los días desde su fin. Sin expediente, no se borra. ENTER y EXIT no se borran. El ledger anota `TRACE_PURGED` cuando sí se borra. Ajustes muestra el estado de cada semana (sin exportar, en retención, se puede expurgar).

## Cómo verifica el empleador la firma

1. Abre el JSON del manifiesto.
2. Arma el cuerpo de `packHash` igual que la app (`packHashBody` en `EvidencePackService`):
   - v1: campos base, sin `manifestVersion` ni `contentHash`.
   - v2: esos campos más `manifestVersion` y `contentHash`.
   - v3 y v4: lo de v2 más `sealWarnings`.
   - Fuera del cuerpo: `files` y `signature`.
3. `SHA-256(canonicalJson(cuerpo))` tiene que ser igual a `packHash`. `canonicalJson` ordena las claves, omite `undefined` y escribe las fechas en milisegundos.
4. Si `manifestVersion` es 4 y hay `signature`:
   - el mensaje es `canonicalJson({ ...cuerpo, packHash })` en UTF-8;
   - la clave pública y la firma van en base64url (32 y 64 bytes);
   - `keyId` es `ed25519:` más los primeros 16 caracteres hexadecimales de SHA-256 de la clave pública;
   - Ed25519 verifica ese mensaje con esa clave pública.
5. Si no hay firma, el esquema es `unsigned-v1`: el hash sigue valiendo y no hay firma que comprobar. No es un fallo.

`EvidencePackService.verify(pack)` hace esos pasos y devuelve `{ valid, legacy, scheme, failures }`. `scheme` es `Ed25519` o `unsigned-v1`.

## Checklist de teléfono

Hazlo con una jornada real, en español y luego en English. Anota el resultado.

| Id | Qué hacer | Qué tiene que pasar |
| --- | --- | --- |
| R1 | Inicia la jornada, llega al sitio y deja el teléfono quieto más de 45 min **dentro** del radio. | No pasa a Revisar por abandono. El heartbeat se renueva con la geocerca o la miga. |
| R2 | Con la jornada abierta, fuerza que no haya lectura dentro (aléjate, o apaga la ubicación) y espera más del hueco de heartbeat. | La jornada sigue abierta, en Revisar. Aviso en español o inglés. Aparece en Hoy, Historial y Salud. No se cierra sola a las 12 h. |
| R3 | En esa jornada, pulsa «Sigo trabajando». | Sigue abierta. El ledger anota que se continuó. No aparece una hora de fin inventada. |
| R4 | Repite R2 y confirma una hora de fin **sin** nota. | No se cierra. Pide la nota. |
| R5 | Confirma una hora de fin anterior a ahora, con nota. | Se cierra con esa hora, clase manual, nota guardada. |
| R6 | En Salud, mira cada fila. | Ubicación, servicio en primer plano y reloj dicen que bloquean VALIDADA. Batería, avisos, red, geocerca y último hecho dicen que solo avisan. |
| R7 | Niega la ubicación en segundo plano con la jornada abierta. | Pasa a Revisar. Batería restringida no lo hace por sí sola. |
| R8 | Con red, adelanta el reloj del teléfono más de 3 min y vuelve a la app (o espera un tick de geocerca). | La jornada queda en Revisar por deriva. El registro tiene una muestra de hora de red. |
| R9 | Modo avión, misma prueba de reloj solo si ya no hay muestra de red previa en esta sesión de la app. | Sin red no se añade un bloqueo nuevo por hora de red. La deriva local del reloj (salto de la pared) sí sigue bloqueando. |
| R10 | Sella la semana. | El manifiesto trae firma, clave pública, `keyId` y `Ed25519`. `packHash` no cambia si quitas la firma y vuelves a hashear el cuerpo. El PDF no se reescribe al abrir un pack viejo. |
| R11 | En Ajustes, mira «Estado de retención» de la semana que acabas de sellar. | Dice que está exportada y aún en retención (no «se puede expurgar» el mismo día). Una semana sin expediente dice que no se borra. |
| R12 | En Soporte, abre las preguntas nuevas (abandono, sensores, reloj, firma, retención). | El número de guía es `soporte.v2`. El texto cambia al pasar a English. |
