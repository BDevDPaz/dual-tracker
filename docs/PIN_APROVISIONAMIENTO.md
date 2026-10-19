# PIN de administración aprovisionado por el empleador

Hasta que el empleador deje un código en el teléfono, el primer usuario fija el PIN. Ajustes lo etiqueta exactamente así: **PIN local (no aprovisionado por empleador)**.

Cuando el código se usa una vez, la etiqueta pasa a **PIN aprovisionado por el empleador**.

## Qué lleva el código

No lleva el PIN en claro. Lleva:

- el hash salado (el mismo cálculo que el teléfono: `src/services/runtime/pinHash.ts`);
- una caducidad;
- un nonce de un solo uso;
- una firma Ed25519 del cuerpo.

La clave pública viaja dentro del código. Sirve para ver si alguien recortó o cambió el texto. No hay una clave del empleador guardada de antemano en la app, y no hace falta un servidor. Quien tenga el código antes de que caduque puede usarlo una vez. El PIN se dice por otro canal (en persona, un papel, una llamada).

Formato: `DTPIN1.` y, detrás, el JSON en base64url. Ese texto es también el contenido del QR. La app no abre la cámara: se pega el texto.

## Cómo generarlo

En la raíz del repo, sin red y sin servidor:

```bash
npx tsx scripts/provision-admin-pin.ts --pin 123456 --hours 72
```

`--hours` es opcional. Si no se pone, caduca a las 72 h (`PIN_PROVISION_DEFAULT_TTL_MS` en `src/config/provisional.ts`). El comando imprime una sola línea. Cópiala o ponla en un QR. No la guardes junto al PIN.

El PIN tiene al menos 6 caracteres. Los escalones de bloqueo no cambian: 3 fallos esperan 30 s, 5 fallos 5 min, 8 fallos 30 min, 10 fallos 24 h.

## Qué hace el teléfono

1. Comprueba el prefijo, la firma y que no haya caducado.
2. Si ese nonce ya se usó en este teléfono, lo rechaza.
3. Si ya hay un PIN de empleador y la zona admin está cerrada, lo rechaza. Hay que desbloquear para sustituirlo.
4. Un PIN local sí se puede sustituir con el código, aunque la zona esté cerrada: todavía no lo había dejado el empleador.
5. Guarda el hash, marca el origen y anota el nonce para que no se repita.
6. Escribe en el registro de integridad `ADMIN_PIN_PROVISIONED` con el nonce y la caducidad. No escribe el PIN, la sal ni el hash.

Si después se desbloquea y se guarda un PIN a mano, vuelve a ser local.

Si el registro de integridad no se puede escribir, la pantalla avisa error de persistencia. El verificador puede haber quedado ya en el llavero: es un fallo a medias y hay que mirar el registro.
