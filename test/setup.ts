/**
 * Setup común de Jest (Propuesta de calidad §5 y §6):
 *  - TZ=UTC y época fija 2026-09-26T15:00:00.000Z inyectada en TimeAuthority.
 *  - Dobles de Expo cableados AQUÍ (no en cada spec), uno por paquete.
 *  - Silencio de logs (salvo en tests de LoggingService).
 *  - Reset de singletons: candados del ConcurrencyGuard, anti-rebote de geocerca,
 *    store, SQLite en memoria.
 */
process.env.TZ = "UTC";

jest.mock("expo-sqlite", () => require("./mocks/expo-sqlite"));
jest.mock("expo-location", () => require("./mocks/expo-location"));
jest.mock("expo-task-manager", () => require("./mocks/expo-task-manager"));
jest.mock("expo-notifications", () => require("./mocks/expo-notifications"));
jest.mock("expo-crypto", () => require("./mocks/expo-crypto"));
jest.mock("expo-file-system", () => require("./mocks/expo-file-system"));
jest.mock("expo-print", () => require("./mocks/expo-print"));
jest.mock("expo-secure-store", () => require("./mocks/expo-secure-store"));
// Bordes nativos adicionales usados por servicios de runtime/evidencia.
jest.mock("expo-battery", () => require("./mocks/expo-battery"));
jest.mock("expo-background-task", () => require("./mocks/expo-background-task"));
jest.mock("expo-sharing", () => require("./mocks/expo-sharing"));
jest.mock("expo-mail-composer", () => require("./mocks/expo-mail-composer"));
jest.mock("expo-clipboard", () => require("./mocks/expo-clipboard"));
jest.mock("expo-blur", () => require("./mocks/expo-blur"));
jest.mock("react-native-safe-area-context", () => require("./mocks/react-native-safe-area-context"));
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));
jest.mock("@expo/vector-icons", () => require("./mocks/expo-vector-icons"));

import { time } from "./time";
import { CREATE_TABLES_SQL } from "../src/services/persistence/schema";
import { ConcurrencyGuardService } from "../src/services/domain/ConcurrencyGuardService";
import { GeofenceRuntimeService } from "../src/services/runtime/GeofenceRuntimeService";
import { Store } from "../src/core/store";
import { FieldCryptoService } from "../src/services/persistence/FieldCryptoService";

const RESETTABLE = [
  "expo-location",
  "expo-task-manager",
  "expo-notifications",
  "expo-file-system",
  "expo-print",
  "expo-secure-store",
  "expo-battery",
  "expo-background-task",
  "expo-sharing",
  "expo-mail-composer",
  "expo-clipboard",
  "react-native-safe-area-context",
];

beforeEach(async () => {
  time.reset();
  ConcurrencyGuardService.__resetForTests();
  GeofenceRuntimeService.__resetForTests();
  Store.reset();
  FieldCryptoService.__resetForTests();
  (require("../src/core/refresh/dataRevision") as typeof import("../src/core/refresh/dataRevision")).__resetForTests();
  (require("../src/services/application/refreshMirror") as typeof import("../src/services/application/refreshMirror")).__resetForTests();
  (require("../src/components/ui/motion") as typeof import("../src/components/ui/motion")).ReduceMotionPref.__reset();
  (require("../src/components/ui/motion") as typeof import("../src/components/ui/motion")).ReduceTransparencyPref.__reset();
  (require("../src/components/feedback/blockingModals") as typeof import("../src/components/feedback/blockingModals")).BlockingModals.__reset();
  for (const m of RESETTABLE) (require(m) as { __reset?: () => void }).__reset?.();
  await (require("expo-sqlite") as typeof import("./mocks/expo-sqlite")).__resetAll(CREATE_TABLES_SQL);

  const testPath = expect.getState().testPath ?? "";
  if (!/LoggingService/.test(testPath)) {
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  }
});

afterEach(() => {
  // Ningún temporizador de debounce vivo entre casos (evita handles abiertos).
  GeofenceRuntimeService.__resetForTests();
  (require("../src/core/refresh/dataRevision") as typeof import("../src/core/refresh/dataRevision")).__resetForTests();
});
