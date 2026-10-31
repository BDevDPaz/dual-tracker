/** D12: coordenadas → nombre de lugar. Si falla, null. Nunca una dirección inventada. */
import { __setPermissions, __state } from "../../../../test/mocks/expo-location";
import { REVERSE_GEOCODE_TIMEOUT_MS, reverseGeocodePoint } from "../reverseGeocode";

describe("reverseGeocodePoint", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test("arma la dirección del punto y no repite el nombre de la calle", async () => {
    __state.reverseGeocode = [
      {
        streetNumber: "123",
        street: "Main St",
        name: "Main St",
        city: "Oakland",
        region: "CA",
        postalCode: "94612",
        country: "United States",
      },
    ];

    await expect(reverseGeocodePoint(37.8044, -122.2712)).resolves.toBe("123 Main St, Oakland, CA, 94612, United States");
    expect(__state.lastReverseQuery).toEqual({ latitude: 37.8044, longitude: -122.2712 });
  });

  test("si el sistema ya trae formattedAddress, usa ese texto", async () => {
    __state.reverseGeocode = [
      {
        formattedAddress: "111 8th Avenue, New York, NY",
        street: "8th Avenue",
        city: "New York",
      },
    ];

    await expect(reverseGeocodePoint(40.7411, -74.001)).resolves.toBe("111 8th Avenue, New York, NY");
  });

  test("antepone el lugar cuando no es la misma calle", async () => {
    __state.reverseGeocode = [
      {
        name: "Oakland City Hall",
        streetNumber: "1",
        street: "Frank H Ogawa Plaza",
        city: "Oakland",
      },
    ];

    await expect(reverseGeocodePoint(37.805, -122.273)).resolves.toBe("Oakland City Hall, 1 Frank H Ogawa Plaza, Oakland");
  });

  test("devuelve null si no hay resultado", async () => {
    __state.reverseGeocode = [];
    await expect(reverseGeocodePoint(37.8, -122.27)).resolves.toBeNull();
  });

  test("devuelve null si las partes vienen vacías", async () => {
    __state.reverseGeocode = [{ street: "  ", city: null, name: "", region: "   " }];
    await expect(reverseGeocodePoint(37.8, -122.27)).resolves.toBeNull();
  });

  test("devuelve null si la red falla", async () => {
    __state.reverseGeocodeError = new Error("Network request failed");
    await expect(reverseGeocodePoint(37.8, -122.27)).resolves.toBeNull();
  });

  test("devuelve null si se agota el tiempo y no usa una dirección tardía", async () => {
    jest.useFakeTimers();
    let finish: (rows: unknown[]) => void = () => undefined;
    __state.reverseGeocodeImpl = () =>
      new Promise((resolve) => {
        finish = resolve;
      });

    const pending = reverseGeocodePoint(37.8, -122.27);
    await jest.advanceTimersByTimeAsync(REVERSE_GEOCODE_TIMEOUT_MS);

    await expect(pending).resolves.toBeNull();
    finish([{ formattedAddress: "Late Street, Oakland" }]);
    await Promise.resolve();
    await expect(pending).resolves.toBeNull();
  });

  test("devuelve null sin consultar si falta el permiso de ubicación", async () => {
    __setPermissions({ foreground: "denied" });
    __state.reverseGeocode = [{ formattedAddress: "No debe usarse" }];

    await expect(reverseGeocodePoint(37.8, -122.27)).resolves.toBeNull();
    expect(__state.reverseGeocodeCalls).toBe(0);
  });

  test("devuelve null si el geocoder rechaza el permiso", async () => {
    __state.reverseGeocodeError = Object.assign(new Error("Not authorized to use location services"), {
      code: "E_LOCATION_UNAUTHORIZED",
    });

    await expect(reverseGeocodePoint(37.8, -122.27)).resolves.toBeNull();
  });

  test("devuelve null sin consultar si las coordenadas no son válidas", async () => {
    await expect(reverseGeocodePoint(Number.NaN, -122.27)).resolves.toBeNull();
    await expect(reverseGeocodePoint(91, -122.27)).resolves.toBeNull();
    await expect(reverseGeocodePoint(37.8, 181)).resolves.toBeNull();
    expect(__state.reverseGeocodeCalls).toBe(0);
  });
});
