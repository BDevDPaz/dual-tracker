import * as Location from "expo-location";
import { LocationService } from "../LocationManager";

// Mocking the whole LocationManager internal dependency on DB if possible
// but actually I can just mock the specific functions used.

jest.mock("../../utils/logger", () => ({
  log: jest.fn(),
}));

jest.mock("../../database/db", () => ({
  getDB: jest.fn(() => ({
    getFirstAsync: jest.fn(),
  })),
}));

jest.mock("../../core/workTrackerEngine", () => ({
  workTrackerEngine: {
    dispatch: jest.fn(),
  },
}));

jest.mock("expo-location", () => ({
  GeofencingEventType: {
    Enter: 1,
    Exit: 2,
  },
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  getBackgroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(),
  startGeofencingAsync: jest.fn(),
  stopGeofencingAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn().mockReturnValue({ catch: jest.fn() }),
  Accuracy: { High: 3 },
}));

jest.mock("expo-task-manager", () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(),
}));

describe("LocationManager - LocationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("requestPermissions debe retornar true si ambos son concedidos", async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "granted",
    });
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: "granted",
    });

    const result = await LocationService.requestPermissions();
    expect(result).toBe(true);
  });

  it("startMonitoringArrival debe validar datos de entrada", async () => {
    const result = await LocationService.startMonitoringArrival(NaN, 0);
    expect(result).toBe(false);
  });
});
