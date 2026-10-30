import { useState, useEffect, useCallback } from "react";
import { workTrackerEngine } from "../workTrackerEngine";
import { WorkTrackerCanonicalState, DomainEvent } from "../contracts";

/**
 * Hook de conexión principal entre la UI y el motor canónico.
 * Implementación reactiva real (sin polling).
 *
 * Responsabilidades:
 * - Suscribirse al engine
 * - Recibir actualizaciones únicamente cuando el estado cambia
 * - Exponer dispatch como única vía de escritura al sistema
 */
export const useWorkTracker = () => {
  const [state, setState] = useState<WorkTrackerCanonicalState>(workTrackerEngine.getState());

  useEffect(() => {
    /**
     * Listener que será invocado por el engine
     * cada vez que el estado canónico cambie.
     */
    const listener = (newState: WorkTrackerCanonicalState) => {
      setState(newState);
    };

    // Suscripción al motor
    const unsubscribe = workTrackerEngine.subscribe(listener);

    // Sincronización inicial por si el estado cambió entre el primer render y el effect
    const currentState = workTrackerEngine.getState();
    setState((prev) => {
      if (prev !== currentState) return currentState;
      return prev;
    });

    // Cleanup al desmontar
    return () => {
      unsubscribe();
    };
  }, []);

  /**
   * Dispatcher memoizado.
   * Es la única forma en que la UI puede modificar el estado.
   */
  const dispatch = useCallback((event: DomainEvent) => {
    workTrackerEngine.dispatch(event);
  }, []);

  return {
    state,
    dispatch,
  };
};
