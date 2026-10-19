/**
 * QR del código de verificación. Se genera en el teléfono (uqr, sin red).
 * El contenido es el packHash, tal cual, para que un escáner offline lo lea.
 */
import escapeHtml from "escape-html";
import { encode } from "uqr";

export const QR_MODULE_PX = 4;
export const QR_BORDER = 4;

/** SVG con módulos negros sobre blanco (escanea igual en el tema claro y en el oscuro). */
export function verificationQrSvg(payload: string): string {
  const qr = encode(payload, { ecc: "M", border: QR_BORDER, boostEcc: false });
  const cell = QR_MODULE_PX;
  const size = qr.size * cell;
  let path = "";
  for (let y = 0; y < qr.size; y++) {
    const row = qr.data[y] ?? [];
    for (let x = 0; x < qr.size; x++) {
      if (!row[x]) continue;
      path += `M${x * cell},${y * cell}h${cell}v${cell}h-${cell}z`;
    }
  }
  const safe = escapeHtml(payload);
  return `<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="128" height="128" role="img" data-qr-payload="${safe}"><rect width="100%" height="100%" fill="#FFFFFF"/><path fill="#1C1915" d="${path}"/></svg>`;
}
