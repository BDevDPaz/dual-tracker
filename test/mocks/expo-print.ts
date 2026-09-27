/** Doble de expo-print: printToFileAsync devuelve { uri: '/tmp/dt/report.pdf' } y guarda el HTML. */
import { __files } from "./expo-file-system";

export const __printed: string[] = [];
export async function printToFileAsync(opts: { html: string }): Promise<{ uri: string; numberOfPages: number }> {
  __printed.push(opts.html);
  const uri = "/tmp/dt/report.pdf";
  __files.set(uri, opts.html);
  return { uri, numberOfPages: 1 };
}
export function __reset(): void {
  __printed.length = 0;
}
