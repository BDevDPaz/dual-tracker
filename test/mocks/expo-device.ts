/** Doble de expo-device. Sin lectura por defecto: no se asienta integridad. */
export let isDevice: boolean | null = null;
export let brand: string | null = null;
export let manufacturer: string | null = null;
export let modelName: string | null = null;
export let productName: string | null = null;
export let osBuildFingerprint: string | null = null;

export function __reset(): void {
  isDevice = null;
  brand = null;
  manufacturer = null;
  modelName = null;
  productName = null;
  osBuildFingerprint = null;
}

export function __set(patch: Partial<{ isDevice: boolean | null; brand: string | null; manufacturer: string | null; modelName: string | null; productName: string | null; osBuildFingerprint: string | null }>): void {
  if ("isDevice" in patch) isDevice = patch.isDevice ?? null;
  if ("brand" in patch) brand = patch.brand ?? null;
  if ("manufacturer" in patch) manufacturer = patch.manufacturer ?? null;
  if ("modelName" in patch) modelName = patch.modelName ?? null;
  if ("productName" in patch) productName = patch.productName ?? null;
  if ("osBuildFingerprint" in patch) osBuildFingerprint = patch.osBuildFingerprint ?? null;
}
