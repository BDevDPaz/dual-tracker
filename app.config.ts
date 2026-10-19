/**
 * Configuración dinámica de Expo — variantes de build (docs/BUILD.md).
 * ============================================================================
 * app.json sigue siendo la base estática (ahí escribe `eas init` el projectId).
 * Este archivo solo la ajusta según APP_VARIANT, que fija cada perfil de eas.json:
 *
 *  - Sin APP_VARIANT → mismos ids, nombre y version que app.json
 *    (com.bdevdpaz.dualtracker, «Dual Tracker», 1.0.0). Perfiles development,
 *    preview y production. Este archivo no pisa `version` ni escribe
 *    versionCode: el número de build lo lleva EAS (`appVersionSource: remote`,
 *    autoIncrement). El último preview fue versionCode 3; el siguiente tiene
 *    que ser mayor.
 *  - EXPO_PUBLIC_RELEASE_CHANNEL (perfil preview, hoy RC1) se copia a
 *    extra.releaseChannel. development y production no lo fijan. preview-d11
 *    y preview-simulator lo heredan de preview.
 *  - APP_VARIANT=d11 → build de prueba D11 (docs/PRUEBAS_DISPOSITIVO.md):
 *    llavero forzado a fallar con EXPO_PUBLIC_DT_FORCE_KEYSTORE_FAILURE=1.
 *    Paquete / bundle `com.bdevdpaz.dualtracker.d11`, nombre «Dual Tracker D11»
 *    y esquema `dualtracker-d11`: se instala junto a la app real y nunca la
 *    sobrescribe ni se confunde con ella.
 *
 * Guarda de build: la bandera D11 fuera de APP_VARIANT=d11 (o un APP_VARIANT
 * desconocido) aborta la evaluación de la config, así que ni `expo start` ni
 * `eas build` ni el prebuild del servidor pueden producir una app real con el
 * llavero roto. Prueba: src/core/__tests__/buildConfig.test.ts.
 */
import type { ConfigContext, ExpoConfig } from "expo/config";

export const D11_FLAG = "EXPO_PUBLIC_DT_FORCE_KEYSTORE_FAILURE";
export const D11_VARIANT = "d11";
/** Canal visible (Ajustes / Soporte). Lo fija el perfil preview de eas.json. */
export const RELEASE_CHANNEL_ENV = "EXPO_PUBLIC_RELEASE_CHANNEL";
const D11_SUFFIX = ".d11";

type Env = Record<string, string | undefined>;

/** Etiqueta de canal pedida por el entorno, o undefined si no hay. */
export function releaseChannelFromEnv(env: Env): string | undefined {
  const raw = env[RELEASE_CHANNEL_ENV]?.trim() || env.RELEASE_CHANNEL?.trim() || "";
  return raw || undefined;
}

function withReleaseChannel(config: ExpoConfig, env: Env): ExpoConfig {
  const releaseChannel = releaseChannelFromEnv(env);
  if (!releaseChannel) return config;
  return { ...config, extra: { ...config.extra, releaseChannel } };
}

/** Aplica la variante pedida en `env` a la config base (app.json). */
export function applyVariant(config: ExpoConfig, env: Env): ExpoConfig {
  const variant = env.APP_VARIANT?.trim() || undefined;
  const flag = env[D11_FLAG]?.trim() || undefined;

  if (variant !== undefined && variant !== D11_VARIANT) {
    throw new Error(`APP_VARIANT="${variant}" no existe. Valores admitidos: sin definir (app real) o "${D11_VARIANT}".`);
  }
  if (flag !== undefined && variant !== D11_VARIANT) {
    throw new Error(
      `${D11_FLAG} solo se admite con APP_VARIANT=${D11_VARIANT} (build de prueba D11). ` +
        "Nunca en development, preview ni production: quita la variable del entorno o de eas.json.",
    );
  }
  if (variant !== D11_VARIANT) return withReleaseChannel(config, env);

  if (flag !== "1") {
    throw new Error(`APP_VARIANT=${D11_VARIANT} exige ${D11_FLAG}=1 (usa el perfil preview-d11 de eas.json).`);
  }
  const pkg = config.android?.package;
  const bundleId = config.ios?.bundleIdentifier;
  if (!pkg || !bundleId) throw new Error("app.json debe definir android.package e ios.bundleIdentifier.");

  return withReleaseChannel(
    {
      ...config,
      name: `${config.name} D11`,
      scheme: `${String(config.scheme ?? "dualtracker")}-d11`,
      ios: { ...config.ios, bundleIdentifier: `${bundleId}${D11_SUFFIX}` },
      android: { ...config.android, package: `${pkg}${D11_SUFFIX}` },
      // La lee keyStore.ts en tiempo de ejecución: la bandera solo actúa en esta variante.
      extra: { ...config.extra, appVariant: D11_VARIANT },
    },
    env,
  );
}

export default ({ config }: ConfigContext): ExpoConfig => applyVariant(config as ExpoConfig, process.env);
