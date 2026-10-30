import * as Crypto from "expo-crypto";

// Hash del PIN de demostración.
// En producción, esto podría venir de variables de entorno o de un backend seguro.
const DEMO_ADMIN_PIN_SHA256 = "03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4";

/**
 * CONTRATO ESTRICTO:
 * Maneja puramente la validación criptográfica y de credenciales.
 * NO debe mantener el estado visual de "desbloqueado" ni mostrar alertas.
 */
export interface SecurityAdapter {
  validateAdminPin(candidatePin: string): Promise<boolean>;
}

export const securityAdapter: SecurityAdapter = {
  async validateAdminPin(candidatePin: string): Promise<boolean> {
    try {
      // Mantenemos la simulación de validación asíncrona (delay protector contra fuerza bruta)
      await new Promise((resolve) => setTimeout(resolve, 650));

      // Procesamos el PIN con la API criptográfica nativa
      const candidateHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        candidatePin.trim(),
      );

      return candidateHash === DEMO_ADMIN_PIN_SHA256;
    } catch (error) {
      console.error("Fallo en la validación criptográfica dentro de securityAdapter:", error);
      return false; // En caso de error técnico, denegamos el acceso por seguridad (fail-secure)
    }
  },
};
