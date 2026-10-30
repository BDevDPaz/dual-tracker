import type { SessionRecord } from "../../core/contracts";
import type { Language } from "../../i18n";
import { t } from "../../i18n";

export const PDF_INTEGRITY_COLORS = {
  INTACTA: { bg: "#D0D0D0", fg: "#000000" },
  EDITADA: { bg: "#FF9C00", fg: "#000000" },
  ELIMINADA: { bg: "#FF3D63", fg: "#000000" },
  AUTO: { bg: "#8A00FF", fg: "#FFFFFF" },
  TRANSITO: { bg: "#00E5FF", fg: "#000000" },
  CANCELADA: { bg: "#2B2BFF", fg: "#FFFFFF" },
} as const;

export type PdfIntegrityMark = keyof typeof PDF_INTEGRITY_COLORS;

const LABEL: Record<PdfIntegrityMark, { es: string; en: string }> = {
  INTACTA: { es: "Intacta", en: "Intact" },
  EDITADA: { es: "Editada", en: "Edited" },
  ELIMINADA: { es: "Eliminada", en: "Deleted" },
  AUTO: { es: "Cerrada automáticamente", en: "Closed automatically" },
  TRANSITO: { es: "En tránsito", en: "In transit" },
  CANCELADA: { es: "Cancelada", en: "Cancelled" },
};

export function pdfIntegrityMarks(session: SessionRecord): PdfIntegrityMark[] {
  const marks: PdfIntegrityMark[] = [];
  const reason = session.bookkeeping.integrityReason;
  if (session.bookkeeping.isDeleted) marks.push("ELIMINADA");
  if (session.bookkeeping.cancelled) marks.push("CANCELADA");
  const auto =
    !session.bookkeeping.cancelled &&
    (session.integrityClass === "AUTO" || reason === "AUTO_CLOSE_12H" || reason === "AUTO_CLOSE_ABANDONMENT" || reason === "EXIT_DECISION_EXPIRED");
  if (auto) marks.push("AUTO");
  if (session.integrityClass === "MANUAL" || session.bookkeeping.original != null) marks.push("EDITADA");
  if (session.transitSegments.some((seg) => !seg.cancelled && !seg.suppressed && seg.endAtMs == null)) marks.push("TRANSITO");
  if (!marks.length && session.integrityClass !== "CONFLICT") marks.push("INTACTA");
  return marks;
}

export function pdfIntegrityBadgesHtml(session: SessionRecord, lang: Language): string {
  const badges = pdfIntegrityMarks(session).map((mark) => {
    const color = PDF_INTEGRITY_COLORS[mark];
    return `<span class="badge b-${mark}" style="background:${color.bg};color:${color.fg}">${LABEL[mark][lang]}</span>`;
  });
  if (session.bookkeeping.integrityReason === "RECOVERED_CLOSED") {
    badges.push(`<span class="badge" style="background:#D0D0D0;color:#000000">${t("comprobante.integrityRecovered", {}, lang)}</span>`);
  }
  if (session.bookkeeping.compliance?.manualArrival) {
    badges.push(`<span class="badge" style="background:#D0D0D0;color:#000000">${t("today.manualArrival", {}, lang)}</span>`);
  }
  if (session.integrityClass === "CONFLICT" && !badges.some((b) => b.includes("b-AUTO") || b.includes("b-EDITADA"))) {
    badges.push(`<span class="badge b-CONFLICT" style="background:#F2994A;color:#000000">${t("integrity.CONFLICT", {}, lang)}</span>`);
  }
  return badges.join(" ");
}
