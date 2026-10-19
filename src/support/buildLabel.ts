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
