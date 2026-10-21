# PIN de administración aprovisionado por el empleador

Hasta que el empleador deje un código en el teléfono, el primer usuario fija el PIN. Ajustes lo etiqueta exactamente así: **PIN local (no aprovisionado por empleador)**.

Cuando el código se usa una vez, la etiqueta pasa a **PIN aprovisionado por el empleador**.

## Qué lleva el código

No lleva el PIN en claro. Lleva:

- el hash scrypt del PIN, con sal aleatoria (`scrypt1$N$r$p$dkLen$sal$hash`, en hexadecimal minúsculo);
- una caducidad;
- un nonce de un solo uso;
- la clave pública Ed25519 del empleador;
- una firma Ed25519 del cuerpo canónico (sin la clave ni la firma).

Formato vigente: versión 2, `kdf: "scrypt"`. Los parámetros son los de `src/config/provisional.ts`: N = 16384, r = 8, p = 1, dkLen = 32. En el ordenador de pruebas eso tarda unos 50 ms y usa unos 16 MB. En un Android de gama media, en JavaScript puro, se espera del orden de 250–500 ms. No bajes N: un PIN ya guardado se verifica con el N que lleva escrito, y un código nuevo tiene que usar exactamente ese N.

Un código versión 1 (hash SHA-256 iterado, 1000 rondas) sigue aceptándose. Al acertar el PIN, el teléfono lo reescribe a scrypt. Hasta entonces el formato viejo sigue verificando.

El texto es `DTPIN1.` y, detrás, el JSON en base64url. Ese texto es también el contenido del QR. La app no abre la cámara: se pega el texto. El PIN se dice por otro canal (en persona, un papel, una llamada).

## Clave del empleador (huella, no a ciegas)

La firma del código se comprueba con la clave pública que viaja dentro del propio código. Eso solo dice que quien tiene el secreto firmó el texto. No dice que esa persona sea el empleador. Quien sustituya el primer código puede firmar el suyo y elegir el PIN. Por eso el teléfono no fija la primera clave solo porque la firma cuadre.

La primera vez hace falta una de estas dos cosas:

- La persona teclea la huella que el empleador le dio por otro canal (en persona, un papel, una llamada). No vale una huella que haya llegado en el mismo mensaje que el código. La app muestra la huella de este código para compararla. Si no coincide, no se fija nada y el nonce no se gasta.
- O el build trae esa clave pública anclada en `EMPLOYER_KEY_ANCHOR_PUB` (`src/config/employerKeyAnchor.ts`, base64url de 32 bytes). Vacío en este repo. Con valor, el primer código solo entra si su clave pública es exactamente esa. Una clave distinta se rechaza (`ANCHOR_MISMATCH`) aunque la huella del código sea la que se tecleó. Cambiar el ancla es un build nuevo.

La huella son los primeros 16 hexadecimales del SHA-256 de la clave pública, en cuatro grupos: `AB12-CD34-EF56-7890`. Mayúsculas, espacios y guiones no importan. El id de la clave es el SHA-256 completo de esos 32 bytes. La huella es el prefijo.

A partir de ahí solo se aceptan códigos firmados por la clave fijada.

Una clave distinta, con la zona admin cerrada, se rechaza. El aviso, en los dos idiomas, pide desbloquear para cambiar de clave. Ese rechazo no gasta el nonce: el mismo código vale después de desbloquear.

Cambiar la clave fijada exige la zona admin abierta con el PIN de ahora. El registro anota la rotación. Guardar un PIN a mano vuelve a marcarlo como local, pero no quita la clave fijada: un código de otra clave sigue pidiendo el desbloqueo.

## Cómo generar la clave y el código

En la raíz del repo, sin red y sin servidor:

```bash
printf '%s\n' '123456' > /tmp/dt-pin
npx tsx scripts/provision-admin-pin.ts --pin-file /tmp/dt-pin --hours 72
```

El PIN también puede ir en `DT_PIN` o en `DT_PIN_FILE`, o teclearse en la terminal (sin eco) si hay un TTY. `--pin` sigue funcionando y escribe un aviso en stderr: el valor queda en el historial del shell y en la lista de procesos. No lo uses.

La primera vez crea `employer-key.json` (modo 0600) con el secreto, la clave pública, el id y la fecha. Las veces siguientes reutilizan ese archivo, así que todos los teléfonos quedan fijados a la misma clave. `--key otra-ruta.json` cambia el archivo. `--hours` es opcional; si no se pone, caduca a las 72 h (`PIN_PROVISION_DEFAULT_TTL_MS`).

La salida estándar es una sola línea: el código. No la guardes junto al PIN. La clave secreta no se imprime. El error estándar dice si la clave es nueva o reutilizada, el id y la huella (`Huella AB12-CD34-EF56-7890`). Esa huella es la que se dicta al teléfono. `employer-key.json` y `employer-key.retired-*.json` están en `.gitignore`. No los subas.

El PIN tiene al menos 6 caracteres. Los escalones de bloqueo no cambian: 3 fallos esperan 30 s, 5 fallos 5 min, 8 fallos 30 min, 10 fallos 24 h.

## Rotar la clave

1. En el ordenador, con el PIN nuevo en un archivo: `DT_PIN_FILE=/tmp/dt-pin npx tsx scripts/provision-admin-pin.ts --hours 72 --rotate`. El archivo actual pasa a `employer-key.retired-<fecha>.json` y se crea una clave nueva. `--pin` avisa y no es el camino.
2. En cada teléfono que ya tenga la clave anterior: desbloquea la zona admin con el PIN de ahora, pega el código nuevo y comprueba que el PIN nuevo abre. El registro escribe `EMPLOYER_KEY_REPINNED` (motivo `ROTATION`) con el id nuevo y el anterior.
3. Un teléfono que todavía no tiene clave fijada no acepta el código nuevo hasta que se teclea la huella nueva, o hasta que el build ancle esa clave (`EMPLOYER_KEY_PINNED`, motivo `FINGERPRINT` o `ANCHOR`).
4. Conserva el archivo retirado hasta que todos los teléfonos hayan aceptado la clave nueva. Si lo borras antes, no podrás firmar un código que esos teléfonos todavía esperan. Después de eso, el archivo retirado se puede borrar. No hace falta para el día a día.

Sin `--rotate`, un código nuevo sigue firmado por la clave de siempre. En un teléfono ya aprovisionado y cerrado, ese código se rechaza porque el nonce es otro y el PIN de empleador ya está puesto: hay que desbloquear para sustituir el PIN, no para aceptar la misma clave.

## Qué hace el teléfono

1. Comprueba el prefijo, el cuerpo, la firma y que no haya caducado.
2. Si no hay clave fijada, esta pasa a ser la del empleador solo si la huella tecleada coincide o si la clave es la anclada en el build. Si no, se rechaza y no se escribe nada.
3. Si la clave no es la fijada y la zona admin está cerrada, lo rechaza y no gasta el nonce.
4. Si la clave no es la fijada y la zona está abierta, sustituye la clave fijada.
5. Si ese nonce ya se usó en este teléfono, lo rechaza.
6. Si ya hay un PIN de empleador y la zona está cerrada, lo rechaza. Hay que desbloquear para sustituirlo. Un PIN local sí se sustituye, aunque la zona esté cerrada, cuando la clave coincide o todavía no hay clave fijada.
7. Guarda el hash (scrypt, o el legado si el código es versión 1), marca el origen y anota el nonce.
8. Escribe en el registro de integridad:
   - `ADMIN_PIN_PROVISIONED` (motivo `EMPLOYER_CODE`) con el nonce, la caducidad y el id de clave;
   - si la clave se fija por primera vez, `EMPLOYER_KEY_PINNED` (motivo `FINGERPRINT` o `ANCHOR`) con el id;
   - si se rota, `EMPLOYER_KEY_REPINNED` (motivo `ROTATION`) con el id nuevo y el anterior.

No escribe el PIN, la sal, el hash ni la clave pública en bruto.

Al acertar un PIN guardado con el hash legado, el teléfono lo reemplaza por scrypt (sal nueva) y conserva el origen. Un fallo no migra. Los escalones de bloqueo se calculan igual en los dos formatos.

Si el registro de integridad no se puede escribir, la pantalla avisa error de persistencia. El verificador y la clave pueden haber quedado ya en el llavero: es un fallo a medias y hay que mirar el registro.
