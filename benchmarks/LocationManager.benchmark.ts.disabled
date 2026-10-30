// --- src/services/__tests__/LocationManager.benchmark.ts ---
import { log } from "../../utils/logger";

const GEOFENCE_TASK = "GEOFENCE_TRACKING_TASK";
const EXIT_TIMESTAMP_KEY = "LAST_GEOFENCE_EXIT_TIMESTAMP";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const BridgeMock = {
  isTaskRegisteredAsync: async (_taskName: string) => {
    await delay(50);
    return true;
  },
  stopGeofencingAsync: async (_taskName: string) => {
    await delay(50);
    return Promise.resolve();
  },
  removeItem: async (_key: string) => {
    await delay(50);
    return Promise.resolve();
  },
};

async function currentImplementation() {
  const start = performance.now();
  try {
    const isRegistered = await BridgeMock.isTaskRegisteredAsync(GEOFENCE_TASK);
    if (isRegistered) {
      await BridgeMock.stopGeofencingAsync(GEOFENCE_TASK);
    }
    await BridgeMock.removeItem(EXIT_TIMESTAMP_KEY);
  } catch {
    // Ignorado intencionalmente para el benchmark
  }
  const end = performance.now();
  return end - start;
}

async function optimizedImplementation() {
  const start = performance.now();
  try {
    await Promise.all([
      BridgeMock.stopGeofencingAsync(GEOFENCE_TASK).catch(() => {}),
      BridgeMock.removeItem(EXIT_TIMESTAMP_KEY),
    ]);
  } catch {
    // Ignorado intencionalmente para el benchmark
  }
  const end = performance.now();
  return end - start;
}

async function runBenchmark() {
  log("BLANCO", "BACKGROUND_TASK", "DEBUG", "Starting Benchmark...");

  // Warmup
  await currentImplementation();
  await optimizedImplementation();

  let totalCurrent = 0;
  let totalOptimized = 0;
  const iterations = 10;

  for (let i = 0; i < iterations; i++) {
    totalCurrent += await currentImplementation();
    totalOptimized += await optimizedImplementation();
  }

  log(
    "BLANCO",
    "BACKGROUND_TASK",
    "DEBUG",
    `Average Current: ${(totalCurrent / iterations).toFixed(2)}ms`,
  );
  log(
    "BLANCO",
    "BACKGROUND_TASK",
    "DEBUG",
    `Average Optimized: ${(totalOptimized / iterations).toFixed(2)}ms`,
  );
  log(
    "BLANCO",
    "BACKGROUND_TASK",
    "DEBUG",
    `Improvement: ${(((totalCurrent - totalOptimized) / totalCurrent) * 100).toFixed(2)}%`,
  );
}

runBenchmark();
