import { useCallback, useState } from "react";
import { securityService } from "../../../services/SecurityService";

/**
 * useAdminSecurity — zona administrativa de app/(tabs)/settings.tsx.
 * Reemplaza el PIN 1234 de demostración: SecurityService rechaza patrones
 * triviales, aplica retardo anti-fuerza bruta y bloqueo progresivo.
 */
export function useAdminSecurity() {
  const [unlocked, setUnlocked] = useState(securityService.isUnlocked());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unlock = useCallback(async (candidate: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const lockedOut = await securityService.isLockedOut();
      if (lockedOut) {
        setError("Demasiados intentos fallidos. Espera antes de volver a intentar.");
        return false;
      }

      const result = await securityService.validateAdminCredential(candidate);
      if (result.ok) {
        securityService.unlock();
        setUnlocked(true);
        return true;
      }

      setError(
        result.retryAfterMs
          ? `Clave incorrecta. Intenta de nuevo en ${Math.ceil(result.retryAfterMs / 1000)}s.`
          : "Clave incorrecta.",
      );
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const lock = useCallback(() => {
    securityService.lock();
    setUnlocked(false);
  }, []);

  const setCredential = useCallback(async (pinOrPassword: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await securityService.setAdminCredential(pinOrPassword);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return { unlocked, error, busy, unlock, lock, setCredential };
}
