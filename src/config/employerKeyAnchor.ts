/**
 * Clave pública Ed25519 del empleador anclada en el binario (base64url, 32 bytes).
 * Vacío en este repo: el primer código no se fija hasta que la persona teclea
 * la huella que el empleador dio por otro canal.
 * Con valor: el primer código solo se fija si su clave pública es exactamente esta.
 * Cambiarla es un build nuevo, no un ajuste del teléfono.
 */
export const EMPLOYER_KEY_ANCHOR_PUB = "";

let override: string | null = null;

export function employerKeyAnchorPub(): string {
  return (override ?? EMPLOYER_KEY_ANCHOR_PUB).trim();
}

export function employerKeyAnchorConfigured(): boolean {
  return employerKeyAnchorPub().length > 0;
}

/** Solo pruebas. `null` vuelve al valor compilado. */
export function __setEmployerKeyAnchorForTests(pub: string | null): void {
  override = pub;
}
