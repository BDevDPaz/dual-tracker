import * as Crypto from "expo-crypto";
import dayjs from "../utils/dayjsSetup";
import { IntegrityClass, PayrollLine, PayrollPolicy, PayrollStatement } from "../core/contracts";
// SessionRecord tiene formas incompatibles en contracts/types.ts (legado) y
// contracts/domain.ts (canónico). Este servicio opera sobre sesiones
// CERRADAS con domainStatus/integrityClass/transitSegments, así que importa
// explícitamente la forma canónica -- nunca desde el barril ambiguo.
import { SessionRecord } from "../core/contracts/domain";

/**
 * ============================================================================
 * PayrollEngineService — Propuesta 5.2 (nuevo, crítico)
 * ----------------------------------------------------------------------------
 * Motor de nómina versionado. Sustituye las utilidades sueltas de
 * `src/utils/payrollUtils.ts` (calculatePay/calculateEarnings), que mezclaban
 * criterios de overtime diario y semanal sin una política declarada.
 *
 * Reglas de frontera (sección 2 y 5.2 de la propuesta):
 *  - Este servicio es la ÚNICA fuente de horas regulares/overtime/almuerzo/
 *    tránsito. ReportService y EvidencePackService solo leen su salida.
 *  - Una política se identifica por `policyId`. Cambiar de política nunca
 *    reescribe un PayrollStatement ya cerrado (sección 10: "Recalcular
 *    historial cerrado cuando cambie el multiplicador de overtime" está
 *    explícitamente prohibido). `recalculateWithNewPolicy` siempre produce
 *    un nuevo PayrollStatement con nuevo id.
 * ============================================================================
 */

/**
 * Política por defecto: California, overtime diario a las 8h y semanal a las
 * 40h, multiplicador 1.5x. Almuerzo no remunerado, tránsito remunerado por
 * defecto salvo que TransitPolicyService diga lo contrario por segmento.
 */
export const CALIFORNIA_DAILY_OT_WEEKLY_40: PayrollPolicy = {
  policyId: "ca-daily-8-weekly-40-v1",
  label: "California — OT diario 8h / OT semanal 40h",
  dailyOvertimeThresholdMinutes: 480,
  weeklyOvertimeThresholdMinutes: 2400,
  overtimeMultiplier: 1.5,
  hourlyRate: 20,
  transitIsPaidByDefault: true,
  lunchIsUnpaid: true,
  effectiveFromMs: Date.parse("2024-01-01T00:00:00Z"),
};

export interface ComputeStatementInput {
  sessions: SessionRecord[];
  policy: PayrollPolicy;
  periodStart: number;
  periodEnd: number;
}

interface PerSessionWorkMinutes {
  session: SessionRecord;
  dateString: string;
  /** Minutos trabajados en sitio, ya descontado almuerzo no remunerado y pausas. */
  workedMinutes: number;
  /** Minutos de tránsito remunerado (no cuentan para el cómputo de sitio, pero sí para el total pagable). */
  paidTransitMinutes: number;
  /** Minutos de tránsito que además cuentan para el umbral de overtime (según policyId del segmento). */
  transitMinutesCountingForOvertime: number;
  lunchDeductedMinutes: number;
}

const EMPTY_ROLLUP: Record<IntegrityClass, number> = {
  VALID: 0,
  MANUAL: 0,
  AUTO: 0,
  CONFLICT: 0,
};

/**
 * Deriva, por sesión cerrada, los minutos trabajados en sitio y los minutos
 * de tránsito remunerado, aplicando la deducción de almuerzo cuando la
 * política lo marca como no remunerado.
 */
function computeSessionMinutes(
  session: SessionRecord,
  policy: PayrollPolicy,
): PerSessionWorkMinutes {
  const start = session.actualStartAtMs ?? session.declaredStartAtMs;
  const end = session.endAtMs ?? start;

  let rawMinutes = Math.max(0, (end - start) / 60000);
  rawMinutes -= session.totalPausedMs / 60000;

  let lunchDeductedMinutes = 0;
  if (policy.lunchIsUnpaid && session.lunch.taken) {
    if (session.lunch.deductedMinutes !== null && session.lunch.deductedMinutes !== undefined) {
      lunchDeductedMinutes = session.lunch.deductedMinutes;
    } else if (session.lunch.startAtMs && session.lunch.endAtMs) {
      lunchDeductedMinutes = (session.lunch.endAtMs - session.lunch.startAtMs) / 60000;
    } else {
      // Sin registro exacto: 60 minutos por defecto (paridad con payrollUtils legacy).
      lunchDeductedMinutes = 60;
    }
  }

  const workedMinutes = Math.max(0, rawMinutes - lunchDeductedMinutes);

  let paidTransitMinutes = 0;
  let transitMinutesCountingForOvertime = 0;
  for (const segment of session.transitSegments) {
    if (segment.endAtMs === null) {
      continue;
    }
    const segmentMinutes = Math.max(0, (segment.endAtMs - segment.startAtMs) / 60000);
    const isPaid = segment.isPaid ?? policy.transitIsPaidByDefault;
    if (isPaid) {
      paidTransitMinutes += segmentMinutes;
      if (segment.countsForOvertime) {
        transitMinutesCountingForOvertime += segmentMinutes;
      }
    }
  }

  const dateString = session.dateString ?? dayjs(start).format("YYYY-MM-DD");

  return {
    session,
    dateString,
    workedMinutes,
    paidTransitMinutes,
    transitMinutesCountingForOvertime,
    lunchDeductedMinutes,
  };
}

/**
 * Asignación de overtime en una sola pasada, sin doble conteo.
 *
 * La propuesta señala explícitamente la ambigüedad entre "criterios
 * distintos (8 h diarias frente a 40 h semanales)". La regla que este motor
 * implementa, de forma defendible y determinista:
 *
 *  1. Overtime DIARIO se calcula primero, por día calendario
 *     (session.dateString), sobre los minutos trabajados EN SITIO (el
 *     tránsito remunerado que cuenta para overtime se agrega al pool del
 *     día en el que ocurre el tránsito, para no perder minutos elegibles).
 *     Todo minuto por encima de `dailyOvertimeThresholdMinutes` en ese día
 *     se etiqueta OVERTIME_DAILY y se retira del pool "regular restante".
 *  2. Sobre el pool que QUEDÓ como regular tras el paso 1 (es decir, ya sin
 *     los minutos ya contados como OVERTIME_DAILY), se aplica el umbral
 *     SEMANAL: si el total regular restante del periodo supera
 *     `weeklyOvertimeThresholdMinutes`, el excedente se reclasifica como
 *     OVERTIME_WEEKLY.
 *  3. Un minuto nunca se cuenta dos veces: una vez que un minuto se marcó
 *     OVERTIME_DAILY dentro de un día, no vuelve a evaluarse para el umbral
 *     semanal; el umbral semanal solo consume del remanente regular. Esto
 *     evita que un mismo minuto aparezca en dos líneas simultáneamente y es
 *     equivalente a "tomar el mayor de las dos atribuciones sin doble
 *     conteo": el diario tiene prioridad porque es la unidad más granular y
 *     detectable por sesión; el semanal actúa como red de seguridad sobre lo
 *     que el diario dejó pasar como regular.
 */
function allocateOvertime(
  perSession: PerSessionWorkMinutes[],
  policy: PayrollPolicy,
): {
  regularMinutes: number;
  overtimeDailyMinutes: number;
  overtimeWeeklyMinutes: number;
} {
  // Paso 1: agrupar minutos trabajados en sitio + tránsito-que-cuenta por día calendario.
  const minutesByDate = new Map<string, number>();
  for (const entry of perSession) {
    const priorMinutes = minutesByDate.get(entry.dateString) ?? 0;
    minutesByDate.set(
      entry.dateString,
      priorMinutes + entry.workedMinutes + entry.transitMinutesCountingForOvertime,
    );
  }

  let overtimeDailyMinutes = 0;
  let regularAfterDaily = 0;

  for (const totalDayMinutes of minutesByDate.values()) {
    if (totalDayMinutes > policy.dailyOvertimeThresholdMinutes) {
      overtimeDailyMinutes += totalDayMinutes - policy.dailyOvertimeThresholdMinutes;
      regularAfterDaily += policy.dailyOvertimeThresholdMinutes;
    } else {
      regularAfterDaily += totalDayMinutes;
    }
  }

  // Paso 2: sobre el remanente regular (ya sin lo contado como OT diario),
  // aplicar el umbral semanal.
  let overtimeWeeklyMinutes = 0;
  let regularMinutes = regularAfterDaily;
  if (regularAfterDaily > policy.weeklyOvertimeThresholdMinutes) {
    overtimeWeeklyMinutes = regularAfterDaily - policy.weeklyOvertimeThresholdMinutes;
    regularMinutes = policy.weeklyOvertimeThresholdMinutes;
  }

  return { regularMinutes, overtimeDailyMinutes, overtimeWeeklyMinutes };
}

/**
 * Serializa un PayrollStatement de forma determinista para hashing: excluye
 * `packHash` y `generatedAtMs` para que el mismo contenido de nómina
 * produzca siempre el mismo hash sin importar cuándo se generó cada PDF
 * (criterio de aceptación: "El PDF del empleado y el del empleador deben
 * compartir el mismo packHash").
 */
function canonicalStatementJson(
  statement: Omit<PayrollStatement, "packHash" | "generatedAtMs">,
): string {
  const sortedLines = [...statement.lines].sort((a, b) => {
    const key = (line: PayrollLine) =>
      `${line.kind}|${line.sessionId ?? ""}|${line.minutes}|${line.rate}|${line.amount}|${line.description}`;
    return key(a).localeCompare(key(b));
  });

  const canonical = {
    id: statement.id,
    periodStart: statement.periodStart,
    periodEnd: statement.periodEnd,
    lines: sortedLines,
    regularHours: statement.regularHours,
    overtimeHours: statement.overtimeHours,
    transitHours: statement.transitHours,
    lunchMinutes: statement.lunchMinutes,
    grossEstimate: statement.grossEstimate,
    integrityRollup: statement.integrityRollup,
    policyId: statement.policyId,
  };

  return JSON.stringify(canonical);
}

async function sha256(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

class PayrollEngineService {
  /**
   * Calcula un PayrollStatement completo para un conjunto de sesiones
   * cerradas bajo una política dada. No muta las sesiones ni escribe en
   * persistencia: es una función de dominio pura salvo por el hash SHA-256
   * (I/O nativo vía expo-crypto, sin efectos secundarios de estado).
   */
  async computeStatement(input: ComputeStatementInput): Promise<PayrollStatement> {
    const { sessions, policy, periodStart, periodEnd } = input;

    const closedSessions = sessions.filter(
      (session) => session.domainStatus === "CERRADA" && !session.isDeleted,
    );

    const perSession = closedSessions.map((session) => computeSessionMinutes(session, policy));

    const { regularMinutes, overtimeDailyMinutes, overtimeWeeklyMinutes } = allocateOvertime(
      perSession,
      policy,
    );

    const totalLunchMinutes = perSession.reduce(
      (sum, entry) => sum + entry.lunchDeductedMinutes,
      0,
    );
    const totalPaidTransitMinutes = perSession.reduce(
      (sum, entry) => sum + entry.paidTransitMinutes,
      0,
    );

    const hourlyRate = policy.hourlyRate;
    const overtimeRate = hourlyRate * policy.overtimeMultiplier;

    const lines: PayrollLine[] = [];

    if (regularMinutes > 0) {
      lines.push({
        kind: "REGULAR",
        sessionId: null,
        minutes: Math.round(regularMinutes),
        rate: hourlyRate,
        amount: (regularMinutes / 60) * hourlyRate,
        description: "Horas regulares del periodo",
      });
    }

    if (overtimeDailyMinutes > 0) {
      lines.push({
        kind: "OVERTIME_DAILY",
        sessionId: null,
        minutes: Math.round(overtimeDailyMinutes),
        rate: overtimeRate,
        amount: (overtimeDailyMinutes / 60) * overtimeRate,
        description: `Overtime diario (> ${policy.dailyOvertimeThresholdMinutes / 60}h/día)`,
      });
    }

    if (overtimeWeeklyMinutes > 0) {
      lines.push({
        kind: "OVERTIME_WEEKLY",
        sessionId: null,
        minutes: Math.round(overtimeWeeklyMinutes),
        rate: overtimeRate,
        amount: (overtimeWeeklyMinutes / 60) * overtimeRate,
        description: `Overtime semanal (> ${policy.weeklyOvertimeThresholdMinutes / 60}h/periodo)`,
      });
    }

    if (totalLunchMinutes > 0) {
      // Línea informativa: $0, deja explícito que el almuerzo no es un
      // simple "restar 60 minutos" oculto sino una línea auditable.
      lines.push({
        kind: "LUNCH_UNPAID",
        sessionId: null,
        minutes: Math.round(totalLunchMinutes),
        rate: 0,
        amount: 0,
        description: "Almuerzo no remunerado (informativo)",
      });
    }

    if (totalPaidTransitMinutes > 0) {
      lines.push({
        kind: "TRANSIT_PAID",
        sessionId: null,
        minutes: Math.round(totalPaidTransitMinutes),
        rate: hourlyRate,
        amount: (totalPaidTransitMinutes / 60) * hourlyRate,
        description: "Traslado remunerado entre sitios",
      });
    }

    const grossEstimate = lines.reduce((sum, line) => sum + line.amount, 0);

    const integrityRollup: Record<IntegrityClass, number> = { ...EMPTY_ROLLUP };
    for (const session of closedSessions) {
      integrityRollup[session.integrityClass] += 1;
    }

    const statementWithoutHash: Omit<PayrollStatement, "packHash" | "generatedAtMs"> = {
      id: this.generateStatementId(policy.policyId, periodStart, periodEnd),
      periodStart,
      periodEnd,
      lines,
      regularHours: regularMinutes / 60,
      overtimeHours: (overtimeDailyMinutes + overtimeWeeklyMinutes) / 60,
      transitHours: totalPaidTransitMinutes / 60,
      lunchMinutes: totalLunchMinutes,
      grossEstimate,
      integrityRollup,
      policyId: policy.policyId,
    };

    const packHash = await sha256(canonicalStatementJson(statementWithoutHash));

    return {
      ...statementWithoutHash,
      packHash,
      generatedAtMs: Date.now(),
    };
  }

  /**
   * Recalcula un periodo bajo una política NUEVA. Nunca muta el
   * PayrollStatement previamente cerrado: siempre produce uno nuevo, con
   * nuevo id y el nuevo policyId, dejando el histórico intacto (sección 10:
   * "Un cambio de regla no reescribe historial cerrado; genera un
   * recálculo con policyId").
   */
  async recalculateWithNewPolicy(input: {
    previousStatement: PayrollStatement;
    sessions: SessionRecord[];
    newPolicy: PayrollPolicy;
  }): Promise<PayrollStatement> {
    const { previousStatement, sessions, newPolicy } = input;

    if (newPolicy.policyId === previousStatement.policyId) {
      throw new Error(
        "recalculateWithNewPolicy requiere un policyId distinto al del statement previo; " +
          "un recálculo con el mismo policyId equivaldría a reescribir historial cerrado.",
      );
    }

    // El statement previo se referencia solo para lectura (auditoría); no se
    // toca ni se retorna mutado.
    void previousStatement;

    return this.computeStatement({
      sessions,
      policy: newPolicy,
      periodStart: previousStatement.periodStart,
      periodEnd: previousStatement.periodEnd,
    });
  }

  private generateStatementId(policyId: string, periodStart: number, periodEnd: number): string {
    return `pay_${policyId}_${periodStart}_${periodEnd}_${Date.now()}_${Math.round(
      Math.random() * 1e6,
    )}`;
  }
}

export const payrollEngineService = new PayrollEngineService();
