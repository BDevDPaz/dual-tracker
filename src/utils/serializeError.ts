/**
 * Serializa un error o valor desconocido a string de forma segura.
 * Maneja objetos circulares y errores de JSON.stringify.
 * Portado de GEOTrack (src/core/workTrackerEngine.ts).
 */
export function serializeError(error: unknown): string {
  try {
    if (error === null) return "null";
    if (error === undefined) return "undefined";
    if (typeof error === "boolean" || typeof error === "number") {
      return String(error);
    }
    if (typeof error === "string") return error;

    if (error instanceof Error) {
      return JSON.stringify({
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: (error as Error & { cause?: unknown }).cause,
      });
    }

    if (typeof error === "object") {
      const cache = new Set<unknown>();
      return JSON.stringify(error, (_key, value) => {
        if (typeof value === "object" && value !== null) {
          if (cache.has(value)) return "[Circular]";
          cache.add(value);
        }
        return value;
      });
    }

    return String(error);
  } catch (e) {
    try {
      return `[Serialization Error: ${String(e)}] Original: ${String(error)}`;
    } catch {
      return "[Unserializable Error]";
    }
  }
}
