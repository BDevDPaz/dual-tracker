# Interfaz premium

Restyle visual de Dual Tracker. No cambia la nómina, el registro de integridad ni los hashes. El PDF de los sellos nuevos es otra versión de documento: `docs/COMPROBANTES_PREMIUM.md`. Un expediente ya sellado se queda como estaba.

Probar en español y en inglés, con la fuente del sistema en 1.0 y en 1.3, en un teléfono Android (referencia: Galaxy S22+). El objetivo táctil mínimo sigue siendo 48 dp.

- **P1.** Fondo obsidiana (`#050505` a `#0A0A0A`). Las tarjetas van de `#121212` a `#161616`, con borde de 1 px `#1F1F1F`. El oro `#C5A059` solo aparece en la acción primaria, en lo seleccionado (pestaña activa, chip, tarjeta elegida) y en el dinero. El resto de la tinta es blanco o metadato `#A0A0A0`.
- **P2.** Títulos de pantalla entre 26 y 28. Las cifras de tiempo y de dinero usan números de ancho fijo (no saltan al cambiar). Los metadatos van en 13–14. No hay pesos 700 ni 800 de Montserrat.
- **P3.** Márgenes de pantalla de 20 dp (16 en un teléfono de menos de 360 dp). 24 dp entre secciones. Radio de tarjeta 16, de botón 14, de pastilla 999. Iconos de cabecera a 24. El vacío usa un icono de 56.
- **P4.** Hoy: título grande, ayuda (?) y salud en la cabecera, acción primaria fija al pie. Con una jornada abierta (esperando, activa, pausa, traslado o salida) la pestaña Hoy lleva un punto oro. Sin jornada, el punto no está.
- **P5.** Historial: mismo encabezado, resumen de horas y dinero, y la hoja V·M·A·C (Validada, Manual, Auto, Conflicto). Abrirla no cambia filtros ni horas.
- **P6.** Reportes: tarjeta de estado del expediente (abierto, sellado, adelantado, desfasado o pendiente de copia). Al sellar, el detalle del paquete muestra el sello un instante. El hash que se lee es el de siempre.
- **P7.** Detalle y Rastro: título, ayuda y salud. En detalle, Editar queda fijo. El rastro vacío explica el plano en una segunda línea.
- **P8.** Ajustes: el interruptor de alto contraste se aplica al momento, sin pulsar Guardar. Los bordes y el texto ganan contraste; el oro no se extiende al resto de la interfaz. Apagarlo vuelve a la paleta obsidiana.
- **P9.** Salud: filas de sensores legibles, avisos con radio 12, carga con esqueleto (barras) en lugar de solo un spinner.
- **P10.** Estados vacíos con título e icono grande. Las hojas de jornada, salida y almuerzo eligen con tarjetas, no con una lista plana. El borde oro marca la tarjeta elegida.
- **P11.** Un háptico ligero al pulsar una acción primaria o una selección. Al confirmar, un check breve. Con «reducir movimiento» no hay bucle de esqueleto, ni deslizamiento de hoja, ni háptico.
- **P12.** Modo práctica: marca de agua «PRÁCTICA» (en inglés, «PRACTICE») que no tapa los botones. Sellar la demostración muestra el mismo sello. Salir no deja datos en Hoy.
- **P13.** Cambiar el idioma en Ajustes o en la práctica repinta títulos, hoja V·M·A·C, contraste y marca de agua.
- **P14.** Un expediente ya generado se abre igual: el PDF y el código de verificación no cambian de contenido por este restyle. Los sellos posteriores usan el comprobante de `docs/COMPROBANTES_PREMIUM.md`.
