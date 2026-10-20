/**
 * Los valores provisionales se definen una sola vez, en src/config/provisional.ts.
 * Copiar la cifra o volver a declarar la constante en otro módulo falla aquí.
 */
import * as fs from "fs";
import * as path from "path";
import { PROVISIONAL, PROVISIONAL_FINGERPRINTS, PROVISIONAL_SPECS } from "../provisional";

const ROOT = path.resolve(__dirname, "../../..");
const OWNER = "src/config/provisional.ts";

const NAMES = [
  "PIN_ATTEMPT_DELAY_MS",
  "PIN_HASH_ITERATIONS",
  "PIN_SCRYPT_N",
  "PIN_SCRYPT_R",
  "PIN_SCRYPT_P",
  "PIN_SCRYPT_DK_LEN",
  "PIN_MIN_LENGTH",
  "PIN_LOCKOUT_STEPS",
  "ADMIN_UNLOCK_TTL_MS",
  "PIN_PROVISION_DEFAULT_TTL_MS",
  "BREADCRUMB_PROFILES",
  "BREADCRUMB_GAP_FACTOR",
  "DEFAULT_DESTINATION_LIMIT",
  "HEARTBEAT_GAP_MS",
  "DEFAULT_EXIT_DEBOUNCE_MS",
  "DEFAULT_EXIT_DECISION_WINDOW_MS",
  "CLOCK_DRIFT_THRESHOLD_MS",
  "TIME_SOURCE_AGREEMENT_MS",
  "CLOCK_SAMPLE_MAX_RTT_MS",
  "CLOCK_SAMPLE_MIN_INTERVAL_MS",
  "CLOCK_DRIFT_CONFIRM_SAMPLES",
  "CLOCK_DRIFT_CONFIRM_SPAN_MS",
  "CLOCK_DRIFT_CONSISTENCY_MS",
  "FUTURE_TIME_TOLERANCE_MS",
  "DEFAULT_TRACE_RETENTION_DAYS",
  "REPORT_MAX_RANGE_MS",
  "PORTAL_BACKOFF_BASE_MS",
  "PORTAL_BACKOFF_CAP_MS",
  "PORTAL_MAX_ATTEMPTS",
  "PORTAL_TIMEOUT_MS",
] as const;

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === "__tests__" || ent.name === "coverage") continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(ent.name) && !ent.name.includes(".test.")) out.push(p);
  }
  return out;
}

function rel(p: string): string {
  return path.relative(ROOT, p).split(path.sep).join("/");
}

describe("valores provisionales", () => {
  const files = [...walk(path.join(ROOT, "src")), ...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "scripts"))];
  const owner = fs.readFileSync(path.join(ROOT, OWNER), "utf8");

  test("cada spec tiene id, unidad, motivo y fuente, y el valor no es vacío", () => {
    const ids = PROVISIONAL_SPECS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of PROVISIONAL_SPECS) {
      expect(s.unit.trim().length).toBeGreaterThan(0);
      expect(s.rationale.trim().length).toBeGreaterThan(10);
      expect(s.source.trim().length).toBeGreaterThan(5);
      expect(s.value).not.toBeUndefined();
    }
    expect(PROVISIONAL.pin.lockoutSteps.value.length).toBeGreaterThan(0);
    expect(PROVISIONAL.heartbeat.gapMs.value).toBe(45 * 60 * 1000);
  });

  test("las constantes planas no se vuelven a declarar fuera de este módulo", () => {
    const re = new RegExp(String.raw`(?:export\s+)?const\s+(${NAMES.join("|")})\s*=`);
    const hits: string[] = [];
    for (const file of files) {
      const r = rel(file);
      if (r === OWNER) continue;
      const src = fs.readFileSync(file, "utf8");
      if (re.test(src)) hits.push(r);
    }
    expect(hits).toEqual([]);
  });

  test("las cifras provisionales no se copian a otro archivo de producción", () => {
    const hits: string[] = [];
    for (const fingerprint of PROVISIONAL_FINGERPRINTS) {
      const escaped = fingerprint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(?<![0-9])${escaped}`, "g");
      expect(owner.match(re)?.length ?? 0).toBeGreaterThan(0);
      for (const file of files) {
        const r = rel(file);
        if (r === OWNER) continue;
        const src = fs.readFileSync(file, "utf8");
        if (re.test(src)) hits.push(`${r} «${fingerprint}»`);
      }
    }
    expect(hits).toEqual([]);
  });
});
