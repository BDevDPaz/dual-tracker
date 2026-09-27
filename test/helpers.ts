/**
 * Helpers de orquestación sobre la persistencia fake (SQLite en memoria).
 * Solo usan servicios públicos; ningún test importa rutas de app/.
 */
import type { SessionIntent, SessionRecord, Site } from "../src/core/contracts";
import { SessionEngineService } from "../src/services/domain/SessionEngineService";
import { DISCLOSURE_VERSION } from "../src/i18n/legal";
import { PersistenceService } from "../src/services/persistence/PersistenceService";
import { DEFAULT_DEVICE_PREFS, SettingsService } from "../src/services/persistence/SettingsService";
import { COMPANY } from "./fixtures/session.fixture";
import { SITE_LAT, SITE_LON, makeEnter } from "./fixtures/spatial.fixture";
import { time } from "./time";

export async function acceptDisclosure(accepted = true): Promise<void> {
  await SettingsService.saveDevice({
    ...DEFAULT_DEVICE_PREFS,
    onboardingCompleted: true,
    disclosureAcceptedVersion: accepted ? DISCLOSURE_VERSION : null,
    disclosureAcceptedAtMs: accepted ? time.now() : null,
  });
  await SettingsService.saveCompany(COMPANY);
  await SettingsService.saveProfile({ employeeName: "Byron", hourlyRate: 20, language: "es", dailyReminderTime: "07:00" });
}

export async function seedSite(o: Partial<Omit<Site, "id">> = {}): Promise<number> {
  return PersistenceService.insertSite({
    alias: "Sitio A",
    address: "1 Main St",
    clientName: null,
    notes: null,
    targetLat: SITE_LAT,
    targetLon: SITE_LON,
    radiusM: 100,
    active: true,
    createdAtMs: time.now(),
    archivedAtMs: null,
    ...o,
  });
}

/** Mundo mínimo operable: aviso aceptado + dos sitios activos. */
export async function seedWorld(): Promise<{ siteA: number; siteB: number }> {
  await acceptDisclosure(true);
  const siteA = await seedSite();
  const siteB = await seedSite({ alias: "Sitio B", address: "2 Main St", targetLat: SITE_LAT + 0.05 });
  return { siteA, siteB };
}


/** Despacha y exige éxito (falla el test con el código de rechazo). */
export async function mustDispatch(intent: SessionIntent, origin: Parameters<typeof SessionEngineService.dispatch>[1] = "UI"): Promise<SessionRecord> {
  const r = await SessionEngineService.dispatch(intent, origin);
  if (!r.ok) throw new Error(`${intent.type} rechazada: ${String(r.code)} ${r.detail ?? ""}`);
  return r.data!.session;
}

/** START_DAY (UI) + ENTER fiable de geocerca → ACTIVA. Devuelve la sesión ACTIVA. */
export async function startAndArrive(siteId: number, arriveAfterMs = 10 * 60_000): Promise<SessionRecord> {
  const s = await mustDispatch({ type: "START_DAY", siteId });
  time.travel(arriveAfterMs);
  return mustDispatch({ type: "ARRIVAL_CONFIRMED", fact: makeEnter({ sessionId: s.id, siteId, timestampMs: time.now() }) }, "GEOFENCE");
}
