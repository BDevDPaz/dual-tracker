/**
 * Build EAS (docs/BUILD.md): la bandera D11 nunca llega a la app real.
 *  - eas.json: solo preview-d11 fija EXPO_PUBLIC_DT_FORCE_KEYSTORE_FAILURE, y
 *    siempre junto a APP_VARIANT=d11; development/preview/production no.
 *  - app.config.ts: sin APP_VARIANT la config es app.json tal cual; la bandera
 *    sin APP_VARIANT=d11 aborta; la variante d11 cambia paquete, bundle y nombre.
 *  - keyStore: en tiempo de ejecución la bandera solo actúa en la variante d11.
 */
import * as fs from "fs";
import * as path from "path";
import type { ExpoConfig } from "expo/config";
import { applyVariant, D11_FLAG, RELEASE_CHANNEL_ENV } from "../../../app.config";
import { APP_VERSION } from "../../constants/app";
import { isForcedKeystoreFailure } from "../../services/persistence/keyStore";

const ROOT = path.resolve(__dirname, "../../..");
const readJson = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));

type Profile = { extends?: string; env?: Record<string, string>; [k: string]: unknown };
const eas = readJson("eas.json") as { cli: Record<string, string>; build: Record<string, Profile>; submit?: unknown };
const base = (readJson("app.json") as { expo: ExpoConfig }).expo;
const pkg = readJson("package.json") as {
  version: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

/** Resuelve `extends` como EAS: el env del hijo se fusiona sobre el del padre. */
function resolveEnv(name: string, seen: string[] = []): Record<string, string> {
  const p = eas.build[name];
  if (!p) throw new Error(`perfil inexistente: ${name}`);
  if (seen.includes(name)) throw new Error(`extends cíclico: ${[...seen, name].join(" → ")}`);
  const parent = p.extends ? resolveEnv(p.extends, [...seen, name]) : {};
  return { ...parent, ...(p.env ?? {}) };
}

const PROFILES = Object.keys(eas.build);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe("eas.json — perfiles", () => {
  test("existen development, preview, preview-d11 y production; versión remota y CLI mínima", () => {
    expect(PROFILES).toEqual(expect.arrayContaining(["development", "preview", "preview-d11", "production"]));
    expect(eas.cli.appVersionSource).toBe("remote");
    expect(eas.cli.version).toMatch(/^>=\s*\d+\.\d+\.\d+$/);
  });

  test("development: dev client e instalación interna", () => {
    expect(eas.build.development).toMatchObject({ developmentClient: true, distribution: "internal" });
    expect(pkg.dependencies["expo-dev-client"]).toBeDefined();
  });

  test("preview: interno, APK y autoIncrement; production: app-bundle y autoIncrement", () => {
    expect(eas.build.preview).toMatchObject({ distribution: "internal", autoIncrement: true, android: { buildType: "apk" } });
    expect(eas.build.production).toMatchObject({ autoIncrement: true, android: { buildType: "app-bundle" } });
    expect(eas.build.production.distribution ?? "store").toBe("store");
    expect(eas.build.production.developmentClient).toBeUndefined();
  });

  test("preview, preview-d11 y production suben versionCode/buildNumber; development no", () => {
    expect(eas.build.preview.autoIncrement).toBe(true);
    expect(eas.build["preview-d11"].autoIncrement).toBe(true);
    expect(eas.build.production.autoIncrement).toBe(true);
    expect(eas.build.development.autoIncrement).toBeUndefined();
    // preview-simulator hereda el de preview (extends).
    expect(eas.build["preview-simulator"].autoIncrement ?? eas.build.preview.autoIncrement).toBe(true);
  });

  test("preview-d11 extiende preview y fija la bandera con APP_VARIANT=d11", () => {
    expect(eas.build["preview-d11"].extends).toBe("preview");
    expect(resolveEnv("preview-d11")).toMatchObject({ APP_VARIANT: "d11", [D11_FLAG]: "1" });
  });

  test.each(["development", "preview", "production"])("%s no fija la bandera D11 ni APP_VARIANT", (name) => {
    const env = resolveEnv(name);
    expect(env[D11_FLAG]).toBeUndefined();
    expect(env.APP_VARIANT).toBeUndefined();
  });

  test("la versión publicada es 1.0.0 y el versionCode no se fija en el repo", () => {
    expect(base.version).toBe("1.0.0");
    expect(pkg.version).toBe("1.0.0");
    expect(APP_VERSION).toBe("1.0.0");
    expect(base.android?.versionCode).toBeUndefined();
    expect(base.ios?.buildNumber).toBeUndefined();
    expect(eas.cli.appVersionSource).toBe("remote");
  });

  test("preview expone el canal RC1; development y production no", () => {
    expect(resolveEnv("preview")[RELEASE_CHANNEL_ENV]).toBe("RC1");
    expect(resolveEnv("preview-simulator")[RELEASE_CHANNEL_ENV]).toBe("RC1");
    expect(resolveEnv("preview-d11")[RELEASE_CHANNEL_ENV]).toBe("RC1");
    expect(resolveEnv("development")[RELEASE_CHANNEL_ENV]).toBeUndefined();
    expect(resolveEnv("production")[RELEASE_CHANNEL_ENV]).toBeUndefined();

    const preview = applyVariant(clone(base), resolveEnv("preview"));
    expect(preview.version).toBe("1.0.0");
    expect(preview.extra?.releaseChannel).toBe("RC1");
    expect(preview.android?.package).toBe("com.bdevdpaz.dualtracker");
    expect(preview.android?.versionCode).toBeUndefined();

    const d11 = applyVariant(clone(base), resolveEnv("preview-d11"));
    expect(d11.extra?.releaseChannel).toBe("RC1");
    expect(d11.extra?.appVariant).toBe("d11");
    expect(d11.android?.package).toBe("com.bdevdpaz.dualtracker.d11");

    expect(applyVariant(clone(base), resolveEnv("production")).extra?.releaseChannel).toBeUndefined();
    expect(applyVariant(clone(base), { [RELEASE_CHANNEL_ENV]: "  " })).toEqual(base);
  });

  test("todo perfil con la bandera es variante d11 y nunca es de tienda ni dev client", () => {
    for (const name of PROFILES) {
      const env = resolveEnv(name);
      if (env[D11_FLAG] === undefined) continue;
      expect({ name, variant: env.APP_VARIANT }).toEqual({ name, variant: "d11" });
      expect(eas.build[name].developmentClient).toBeUndefined();
      expect(eas.build[name].distribution ?? eas.build.preview.distribution).not.toBe("store");
    }
  });

  test("cada perfil produce una config válida y solo la variante d11 cambia los ids", () => {
    for (const name of PROFILES) {
      const cfg = applyVariant(clone(base), resolveEnv(name));
      const d11 = resolveEnv(name).APP_VARIANT === "d11";
      expect(cfg.android?.package).toBe(d11 ? "com.bdevdpaz.dualtracker.d11" : "com.bdevdpaz.dualtracker");
      expect(cfg.ios?.bundleIdentifier).toBe(d11 ? "com.bdevdpaz.dualtracker.d11" : "com.bdevdpaz.dualtracker");
    }
  });

  test("sin secretos: ni contraseñas, tokens, claves ni rutas de credenciales", () => {
    const raw = fs.readFileSync(path.join(ROOT, "eas.json"), "utf8");
    expect(raw).not.toMatch(/password|secret|token|apiKey|serviceAccount|ascApiKey|appleId|ascAppId|keystorePath|keyAlias|\.p8|\.p12|\.jks|\.json"/i);
  });
});

describe("app.config.ts — variantes", () => {
  test("sin APP_VARIANT la config es app.json tal cual (mismos ids, nombre y extra)", () => {
    const input = clone(base);
    expect(applyVariant(input, {})).toEqual(base);
    expect(applyVariant(clone(base), { APP_VARIANT: "", [D11_FLAG]: "" })).toEqual(base);
  });

  test.each([
    [{ [D11_FLAG]: "1" }],
    [{ [D11_FLAG]: "0" }],
    [{ [D11_FLAG]: "true" }],
    [{ [D11_FLAG]: "1", APP_VARIANT: "production" }],
  ])("rechaza la bandera fuera de APP_VARIANT=d11: %j", (env) => {
    expect(() => applyVariant(clone(base), env)).toThrow(/solo se admite con APP_VARIANT=d11|no existe/);
  });

  test("rechaza variantes desconocidas (D11 en mayúsculas incluido)", () => {
    expect(() => applyVariant(clone(base), { APP_VARIANT: "D11", [D11_FLAG]: "1" })).toThrow(/no existe/);
    expect(() => applyVariant(clone(base), { APP_VARIANT: "staging" })).toThrow(/no existe/);
  });

  test("la variante d11 exige la bandera = 1", () => {
    expect(() => applyVariant(clone(base), { APP_VARIANT: "d11" })).toThrow(/exige/);
    expect(() => applyVariant(clone(base), { APP_VARIANT: "d11", [D11_FLAG]: "0" })).toThrow(/exige/);
  });

  test("la variante d11 se instala aparte: paquete, bundle, nombre y esquema propios", () => {
    const input = clone(base);
    const cfg = applyVariant(input, { APP_VARIANT: "d11", [D11_FLAG]: "1" });
    expect(cfg.name).toBe("Dual Tracker D11");
    expect(cfg.scheme).toBe("dualtracker-d11");
    expect(cfg.android?.package).toBe("com.bdevdpaz.dualtracker.d11");
    expect(cfg.ios?.bundleIdentifier).toBe("com.bdevdpaz.dualtracker.d11");
    expect(cfg.extra?.appVariant).toBe("d11");
    // Mismo slug/owner: es el mismo proyecto EAS, no otro.
    expect(cfg.slug).toBe(base.slug);
    expect(cfg.owner).toBe(base.owner);
    // Permisos y plugins intactos; la base no se muta.
    expect(cfg.android?.permissions).toEqual(base.android?.permissions);
    expect(cfg.plugins).toEqual(base.plugins);
    expect(input).toEqual(base);
  });

  test("los iconos de marca resuelven: A en la app, D en la notificación", () => {
    const png = (rel: string) => {
      const buf = fs.readFileSync(path.join(ROOT, rel));
      expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    };
    expect(base.icon).toBe("./assets/images/icon.png");
    expect(png(base.icon!)).toEqual({ w: 1024, h: 1024 });
    expect(base.splash).toMatchObject({ image: "./assets/images/splash.png", backgroundColor: "#050505", resizeMode: "contain" });
    expect(png(base.splash!.image!)).toEqual({ w: 1284, h: 1284 });
    expect(base.android?.adaptiveIcon).toMatchObject({
      foregroundImage: "./assets/images/adaptive-icon.png",
      monochromeImage: "./assets/images/adaptive-monochrome.png",
      backgroundColor: "#050505",
    });
    expect(png(base.android!.adaptiveIcon!.foregroundImage!)).toEqual({ w: 1024, h: 1024 });
    expect(png(base.android!.adaptiveIcon!.monochromeImage!)).toEqual({ w: 1024, h: 1024 });
    expect(base.web?.favicon).toBe("./assets/images/favicon.png");
    expect(png(base.web!.favicon!)).toEqual({ w: 48, h: 48 });
    const notif = (base.plugins ?? []).find((p) => Array.isArray(p) && p[0] === "expo-notifications") as [string, { icon: string; color: string }];
    expect(notif[1]).toMatchObject({ icon: "./assets/images/notification-icon.png", color: "#C5A059" });
    expect(png(notif[1].icon)).toEqual({ w: 96, h: 96 });
    for (const rel of ["assets/brand/A/icon.svg", "assets/brand/A/adaptive-foreground.svg", "assets/brand/A/monochrome.svg", "assets/brand/D/icon.svg", "assets/brand/D/adaptive-foreground.svg", "assets/brand/D/monochrome.svg"]) {
      expect(fs.existsSync(path.join(ROOT, rel))).toBe(true);
    }
  });

  test("app.json conserva los ids de la app real y no declara la variante", () => {
    expect(base.android?.package).toBe("com.bdevdpaz.dualtracker");
    expect(base.ios?.bundleIdentifier).toBe("com.bdevdpaz.dualtracker");
    expect(base.extra?.appVariant).toBeUndefined();
  });
});

describe("keyStore — cerrojo en tiempo de ejecución", () => {
  test.each([
    ["1", "d11", true],
    ["1", undefined, false],
    ["1", "production", false],
    ["0", "d11", false],
    [undefined, "d11", false],
    [undefined, undefined, false],
  ])("bandera %p + variante %p → %p", (flag, variant, expected) => {
    expect(isForcedKeystoreFailure(flag, variant)).toBe(expected);
  });
});

describe("package.json — scripts de build", () => {
  test.each([
    ["build:android:preview", "--profile preview --platform android"],
    ["build:ios:preview", "--profile preview --platform ios"],
    ["build:android:d11", "--profile preview-d11 --platform android"],
    ["build:ios:d11", "--profile preview-d11 --platform ios"],
    ["build:android:dev", "--profile development --platform android"],
  ])("%s → eas build %s", (script, args) => {
    expect(pkg.scripts[script]).toBe(`npx eas-cli@latest build ${args}`);
  });

  test("eas-cli no es dependencia (se usa con npx)", () => {
    expect(pkg.dependencies["eas-cli"]).toBeUndefined();
    expect(pkg.devDependencies["eas-cli"]).toBeUndefined();
  });
});
