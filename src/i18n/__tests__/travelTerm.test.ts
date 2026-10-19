/**
 * El traslado se dice Travel en todo el inglés visible (estados, avisos,
 * notificaciones, guías, FAQ y legal). Las claves internas pueden seguir
 * llamándose transfer; el texto que ve la persona, no.
 */
import { en } from "../en";
import { getDisclosureContent, getRetentionContent } from "../legal";
import { MICROCOPY, MICROCOPY_REJECTIONS } from "../microcopy";

function walk(node: unknown, out: string[]): void {
  if (typeof node === "string") out.push(node);
  else if (Array.isArray(node)) node.forEach((item) => walk(item, out));
  else if (node && typeof node === "object") Object.values(node).forEach((item) => walk(item, out));
}

/** Frases que la interfaz enseña en inglés. No incluye las claves (transfer, TRANSFER_START). */
export function englishUserStrings(): string[] {
  const out: string[] = [];
  walk(en, out);
  for (const entry of Object.values(MICROCOPY)) {
    if (entry.en) out.push(entry.en.title, entry.en.message);
  }
  walk(MICROCOPY_REJECTIONS.en, out);
  walk(getDisclosureContent("en"), out);
  walk(getRetentionContent("en", 90), out);
  return out;
}

export function transferHits(strings: readonly string[]): string[] {
  return strings.filter((s) => /transfer/i.test(s));
}

describe("término inglés del traslado", () => {
  test("marca Transfer y transfers, y deja pasar Travel y transition", () => {
    expect(transferHits(["Start transfer", "Cancel Transfer", "several transfers"])).toEqual([
      "Start transfer",
      "Cancel Transfer",
      "several transfers",
    ]);
    expect(transferHits(["Start travel", "Traveling", "Paid travel", "transition period"])).toEqual([]);
  });

  test("ninguna frase inglesa visible contiene Transfer", () => {
    expect(transferHits(englishUserStrings())).toEqual([]);
  });
});
