/** Doble de expo-battery. */
export const __state = { level: 0.8, optimizationEnabled: false };
export async function getBatteryLevelAsync() {
  return __state.level;
}
export async function isBatteryOptimizationEnabledAsync() {
  return __state.optimizationEnabled;
}
export function __reset(): void {
  __state.level = 0.8;
  __state.optimizationEnabled = false;
}
