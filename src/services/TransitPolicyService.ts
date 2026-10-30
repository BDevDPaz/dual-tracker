import { PayrollPolicy, TransitSegment } from "../core/contracts";

/**
 * ============================================================================
 * TransitPolicyService — Propuesta 5.6 (nuevo)
 * ----------------------------------------------------------------------------
 * Separa el traslado pagado del tiempo en sitio. El estado TRASLADO ya existe
 * en la máquina de dominio, pero el efecto de nómina no estaba formalizado:
 * este servicio decide si el trayecto entre sitio A y sitio B es remunerado,
 * a qué política corresponde y si cuenta para overtime.
 * ============================================================================
 */

/** Error tipado: no se puede iniciar un traslado sin destino declarado. */
export class TransitDestinationRequiredError extends Error {
  constructor(message = "Se exige un destino configurado antes de iniciar el traslado.") {
    super(message);
    this.name = "TransitDestinationRequiredError";
  }
}

function generateTransitId(): string {
  return `transit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

class TransitPolicyService {
  /**
   * Construye un TransitSegment aplicando la política vigente.
   * Regla explícita: si el traslado es pagado (`policy.transitIsPaidByDefault`),
   * esos minutos SÍ cuentan como horas trabajadas y por lo tanto cuentan para
   * overtime (diario/semanal) igual que cualquier otro minuto pagado. Un
   * traslado no pagado nunca cuenta para overtime, porque no es tiempo
   * trabajado remunerado.
   */
  decideTransit(input: {
    fromSiteId: string | null;
    toSiteId: string | null;
    startAtMs: number;
    policy: PayrollPolicy;
  }): TransitSegment {
    this.requireDestinationBeforeTransit(input.toSiteId);

    const isPaid = input.policy.transitIsPaidByDefault;
    // El traslado pagado se suma a las horas trabajadas del período, así que
    // participa de los umbrales de overtime diario/semanal de la política.
    const countsForOvertime = isPaid;

    const segment: TransitSegment = {
      id: generateTransitId(),
      sessionId: -1, // placeholder: el llamador (SessionEngine) fija el sessionId real al persistir.
      fromSiteId: input.fromSiteId,
      toSiteId: input.toSiteId,
      startAtMs: input.startAtMs,
      endAtMs: null,
      isPaid,
      countsForOvertime,
      policyId: input.policy.policyId,
    };
    return segment;
  }

  /**
   * "Exige destino configurado antes de iniciar trayecto." Lanza
   * `TransitDestinationRequiredError` si `toSiteId` es null/vacío.
   */
  requireDestinationBeforeTransit(toSiteId: string | null): void {
    if (!toSiteId || toSiteId.trim().length === 0) {
      throw new TransitDestinationRequiredError();
    }
  }

  /**
   * "Si el operador sale de A y no declara B en el plazo de decisión, el
   * ledger marca PENDING_EXIT y no inventa un traslado."
   * `decisionWindowMs` se documenta para el llamador (quien mide el tiempo
   * transcurrido desde `exitAtMs`); este método es puro y determinista.
   */
  handlePendingExit(
    sessionId: number,
    exitAtMs: number,
    decisionWindowMs: number,
    decidedWithinWindow: boolean,
  ): "PENDING_EXIT" | "TRANSIT_STARTED" {
    void sessionId;
    void exitAtMs;
    void decisionWindowMs;
    return decidedWithinWindow ? "TRANSIT_STARTED" : "PENDING_EXIT";
  }
}

export const transitPolicyService = new TransitPolicyService();
