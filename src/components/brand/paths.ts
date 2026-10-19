/**
 * Trazos de las marcas A (Pin-Reloj) y D (Llegada confirmada).
 * Deben coincidir con assets/brand/{A,D}/adaptive-foreground.svg
 * (scripts/brand/build.py). El viewBox es 1024.
 */

export const MARK_VIEWBOX = 1024;

/** Pin del concepto A. */
export const PIN_CLOCK_PIN = "M 347.9,554.3 A 200 200 0 1 1 676.1,554.3 L 512,790 Z";
/** Manecillas: 12 en punto y hacia las 4. */
export const PIN_CLOCK_HANDS = "M512,440 L512,342 M512,440 L582,486";

/** Pin del concepto D (el check se recorta con máscara). */
export const ARRIVAL_PIN = "M 354.4,526.2 A 190 190 0 1 1 669.6,526.2 L 512,760 Z";
/** Check recortado del pin. */
export const ARRIVAL_CHECK = "M432,428 L488,484 L596,376";
/** Línea de base bajo el pin. */
export const ARRIVAL_LINE = "M432,812 L592,812";
