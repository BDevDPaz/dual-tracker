import { workTrackerReducer } from "../reducer";
import { createInitialState } from "../state";
import { DomainEvent } from "../contracts";
import { selectNeedsOnboarding, selectNeedsDisclaimer, selectIsHydrated } from "../selectors";

describe("Navigation Logic", () => {
  it("debe marcar onboarding como completado", () => {
    const state = createInitialState();
    expect(selectNeedsOnboarding(state)).toBe(true);

    const event: DomainEvent = { type: "ONBOARDING_COMPLETED" };
    const nextState = workTrackerReducer(state, event);

    expect(nextState.domain.settings.onboardingCompleted).toBe(true);
    expect(selectNeedsOnboarding(nextState)).toBe(false);
  });

  it("debe marcar disclaimer como aceptado", () => {
    const state = createInitialState();
    expect(selectNeedsDisclaimer(state)).toBe(true);

    const event: DomainEvent = { type: "DISCLAIMER_ACCEPTED" };
    const nextState = workTrackerReducer(state, event);

    expect(nextState.domain.settings.disclaimerAccepted).toBe(true);
    expect(selectNeedsDisclaimer(nextState)).toBe(false);
  });

  it("debe manejar estado de hidratación correctamente", () => {
    const state = createInitialState();
    expect(selectIsHydrated(state)).toBe(false); // isRehydrating es true por defecto

    const event: DomainEvent = {
      type: "APP_REHYDRATION_COMPLETED",
      timestampMs: 1234567890,
    };
    const nextState = workTrackerReducer(state, event);

    expect(selectIsHydrated(nextState)).toBe(true);
  });
});
