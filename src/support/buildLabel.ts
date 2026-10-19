import Constants from "expo-constants";

/** Compilación visible en Soporte. Vacío en Jest y en Expo Go sin build nativo. */
export function readBuildLabel(): string {
  const native = Constants.nativeBuildVersion || Constants.nativeAppVersion;
  if (native) return String(native);
  const android = Constants.expoConfig?.android?.versionCode;
  const ios = Constants.expoConfig?.ios?.buildNumber;
  if (android != null) return String(android);
  if (ios) return String(ios);
  return "dev";
}

/**
 * Canal de la build (p. ej. RC1). Lo escribe app.config.ts en extra a partir
 * de EXPO_PUBLIC_RELEASE_CHANNEL. Vacío en development, production y en Jest.
 */
export function readReleaseChannel(): string {
  const extra = Constants.expoConfig?.extra?.releaseChannel;
  if (typeof extra === "string" && extra.trim()) return extra.trim();
  const fromEnv = process.env.EXPO_PUBLIC_RELEASE_CHANNEL;
  if (typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim();
  return "";
}
