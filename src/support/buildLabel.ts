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
/** versionCode de Android, o el build nativo si es numérico. null en Jest. */
export function readVersionCode(): number | null {
  const android = Constants.expoConfig?.android?.versionCode;
  if (typeof android === "number" && Number.isFinite(android)) return android;
  const native = Constants.nativeBuildVersion;
  if (typeof native === "string" && /^\d+$/.test(native)) return Number(native);
  return null;
}

/** Commit de la build (extra.gitCommit o EXPO_PUBLIC_GIT_COMMIT). null si no hay. */
export function readGitCommit(): string | null {
  const extra = Constants.expoConfig?.extra?.gitCommit;
  const fromExtra = typeof extra === "string" ? extra.trim() : "";
  const fromEnv = process.env.EXPO_PUBLIC_GIT_COMMIT?.trim() ?? "";
  const raw = fromExtra || fromEnv;
  return /^[0-9a-f]{7,40}$/i.test(raw) ? raw : null;
}

export function readReleaseChannel(): string {
  const extra = Constants.expoConfig?.extra?.releaseChannel;
  if (typeof extra === "string" && extra.trim()) return extra.trim();
  const fromEnv = process.env.EXPO_PUBLIC_RELEASE_CHANNEL;
  if (typeof fromEnv === "string" && fromEnv.trim()) return fromEnv.trim();
  return "";
}
