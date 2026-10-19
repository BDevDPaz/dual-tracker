# Comprobantes premium

El PDF de un sello nuevo (`documentVersion` 2) es el comprobante de esta página. Un expediente que ya estaba sellado no tiene ese campo: se sigue leyendo con la plantilla anterior, en español, y su archivo no se reescribe.

No cambia la nómina, el ledger ni el significado de `packHash` y `contentHash`. `documentVersion`, `documentTheme` y `documentLocale` viven en el manifiesto y quedan **fuera** de los dos hashes, igual que la firma y la lista de archivos. Por eso un pack sellado antes sigue verificando byte a byte, y quitarle esos tres campos a un sello nuevo tampoco rompe el código.

El tema de serie del papel es **claro**. El oscuro es un ajuste aparte del tema de la app (`Ajustes → Tema del comprobante`). El idioma es el del perfil en el momento del sello (`documentLocale`), no el que tenga el teléfono cuando se vuelve a abrir. Los anexos se eligen al compartir y se pintan en una copia; el PDF sellado no se sustituye.

El QR se genera en el dispositivo. Su contenido es el `packHash`, sin URL y sin red.

## Qué mirar en el PDF

- Marca **D** en oro `#C5A059` y una línea del mismo oro.
- Dos columnas: empleado, empleador, periodo, generado, versión del documento.
- Cinco cifras: horas regulares, horas extra, tránsito (en inglés, Travel), sesiones y estimado bruto. El bruto va resaltado.
- Tabla con distintivo de integridad, nota del operario en estilo secundario y cifras a la derecha, de ancho fijo.
- En el comprobante del empleado, una fila de $0 no se imprime. Sigue en el expediente del empleador.
- Código de verificación en monoespacio, referencia del expediente y QR de ese código.
- `Firmado · keyId` si hay firma Ed25519. Si no: `Sin firma del dispositivo` y el indicador. La advertencia de notas ilegibles, si aplica, y la línea de conteo de integridad.
- Política y reglas activas, retención y exportación, versiones de documento, manifiesto y expediente, pie legal y sello `SELLADO` (`SEALED` en inglés).
- Marca de agua `PRÁCTICA` solo si el documento se pinta en modo práctica. Un sello real no la lleva.
- Anexos opcionales: bitácora forense (asientos, sin el payload) y entradas/salidas **sin coordenadas**.

## Muestras

`npx tsx scripts/sample-comprobantes.ts` escribe HTML y, si hay Chrome, los PDF (por defecto en `/opt/cursor/artifacts/comprobantes/`; otra carpeta con `COMPROBANTES_OUT`). Esas muestras no son expedientes sellados: no tienen un `packHash` de un teléfono.

## Lista en el teléfono (español)

Probar en un Android (referencia: Galaxy S22+), con una semana que ya tenga jornadas cerradas y, si se puede, otra jornada de cero minutos. Repetir el idioma en inglés donde la lista lo dice.

- **C1.** Ajustes → Tema del comprobante. Sin haberlo tocado, está en Claro.
- **C2.** Sellar la semana. El comprobante del empleado tiene la D en oro, la línea oro y fondo claro.
- **C3.** En la cabecera se leen, en dos columnas, el empleado, el empleador, el periodo, la fecha de generación y «Documento v2».
- **C4.** Hay cinco cifras: horas regulares, horas extra, tránsito, sesiones y estimado bruto. El bruto está resaltado.
- **C5.** Cada fila trae su distintivo de integridad. Una nota se ve en cursiva y más clara que el resto. Horas e importes quedan a la derecha y no saltan de ancho.
- **C6.** La jornada de $0 no está en el comprobante del empleado. El aviso dice cuántas se omitieron. En el expediente del empleador la fila sigue, con el texto de duración cero.
- **C7.** El código de verificación está en un tipo de ancho fijo. Escanear el QR **sin datos** muestra ese mismo código, completo.
- **C8.** Con la firma del teléfono se lee `Firmado ·` y el identificador de la clave. Si el sello quedó sin firma, se lee `Sin firma del dispositivo` y el indicador.
- **C9.** La línea de integridad cuenta validadas, ajustes, cierres automáticos, por revisar y asientos, y dice si la cadena está íntegra. Si el teléfono avisó de notas ilegibles, esa advertencia y los números de jornada están en el PDF.
- **C10.** Se ven la política (con su identificador), las reglas activas, los días de retención, la nota de guardar una copia, «Documento v… · Manifiesto v… · Expediente …», el pie que dice que no es un dictamen legal, y el sello `SELLADO`.
- **C11.** Pasar la interfaz a English y sellar otra semana, o reemitir. El PDF nuevo dice Employee receipt, Travel y SEALED. El PDF de C2 sigue en español: no se reescribió.
- **C12.** Elegir Oscuro y volver a sellar (reemisión). El PDF nuevo es oscuro y el oro se sigue viendo. El PDF claro anterior no cambió. Volver a Claro deja los ya sellados como estaban.
- **C13.** En el paquete, los dos anexos empiezan apagados. Compartir entrega el archivo sellado. Encender Bitácora forense y Entradas y salidas y compartir otra vez: esa copia trae la bitácora y las horas de entrada y salida, y no muestra latitud ni longitud. El archivo sellado, abierto de nuevo, no trae esos anexos.
- **C14.** Un expediente sellado antes de esta versión se abre igual. Su código sigue verificando. En su pantalla no están los interruptores de anexos. Compartirlo no cambia el archivo.
- **C15.** Entrar en modo práctica. La marca de agua dice PRÁCTICA (PRACTICE si la práctica está en inglés) y no tapa los botones. Sellar la demostración no crea un expediente en Reportes ni modifica un PDF real. Al salir, Hoy sigue igual.
- **C16.** El alto contraste de la app no cambia el PDF. El tema oscuro de la interfaz tampoco: solo el ajuste «Tema del comprobante».
