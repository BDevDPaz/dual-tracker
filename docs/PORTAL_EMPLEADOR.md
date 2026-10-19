# Portal del empleador

La cola offline ya existía. Esta tanda añade el envío. Viene **apagado** y **sin dirección**. Ajustes dice exactamente: **Portal del empleador: no configurado**.

No se llama a `fetch` si falta la bandera o si la dirección no es `https` con un nombre de host. `http`, vacío o mal escrito no salen del teléfono.

## Qué se envía

Un POST por expediente ya sellado. No se sube el PDF. El cuerpo es JSON canónico:

```json
{
  "manifest": {},
  "statement": {},
  "evidence": {}
}
```

`manifest` es el manifiesto firmado (incluye `packHash` y la firma Ed25519 del dispositivo). `statement` es el estado de nómina de esa semana. `evidence` es el resumen (conteo y hashes del registro, resúmenes de traza). No van coordenadas sueltas ni el PDF.

Cabeceras:

| Cabecera | Valor |
| --- | --- |
| `Content-Type` | `application/json` |
| `Idempotency-Key` | `manifest.packHash` |

La misma clave va en la fila de la cola (`idempotency_key`). Un sello nuevo es otra fila, aunque sea el mismo periodo.

## Respuestas

| Estado | Qué hace el teléfono |
| --- | --- |
| 2xx | El ítem pasa a `SYNCED`. |
| 409 | También `SYNCED`. Significa que ese `packHash` ya estaba recibido. |
| 400, 401, 403, 404, 422 y el resto de 4xx salvo 408, 425 y 429 | `FAILED` y no se reintenta. |
| 408, 425, 429, 500, 502, 503, 504, corte de red o de tiempo | `FAILED` y se reintenta. |

La espera es exponencial: 30 s, luego el doble, con tope de 6 h. A los 8 intentos el ítem se queda en `FAILED` y no se reintenta solo. El expediente sigue en el teléfono.

El tiempo de corte de cada POST es 20 s.

Esas cifras están en `src/config/provisional.ts` (`portal.*`).

## Cuándo se intenta

`OfflineQueueService.flush()` recorre `PENDING` y `FAILED` que ya cumplieron la espera y no agotaron los intentos. El barrido de integridad llama a `flush()`. Sin URL https y sin la bandera, devuelve `skipped` y no toca la red.

La bandera y la URL viven en la política de empresa (`employerPortalEnabled`, `employerPortalUrl`). Solo la zona admin las cambia. Una URL que no es https se rechaza al guardar (`PORTAL_URL_INVALID`). Encender el envío sin URL también.

## Qué no hace

- No hay revocación de packs.
- No autentica al portal con un token: el destinatario es la URL que escribió el admin. La firma del manifiesto es la del teléfono, la misma de la tanda 1.
- El diagnóstico de Soporte solo dice `unconfigured`, `disabled` o `enabled`. No incluye la URL.
