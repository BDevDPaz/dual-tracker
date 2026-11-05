// core-v2/index.ts - Cómo conectarlo en bootWiring.ts y en tu HoyScreen

import { transition, getSideEffects } from './stateMachine';
import { WorkState } from './types';
import { armGeofence, defineGeofenceTask, GEOFENCE_RADIUS } from './geofenceService';

// 1. En bootWiring.ts - UNA sola vez al iniciar la app
export function initCoreV2() {
  defineGeofenceTask(
    (region) => {
      // Entrada detectada aunque app esté cerrada
      // Aquí llamas a tu store / context: dispatch({ type: 'GEOFENCE_ENTRY' })
      console.log('ENTER', region);
    },
    (region) => {
      // Salida detectada -> disparas notificación WAITING_DECISION
      console.log('EXIT', region);
    }
  );
}

// 2. Ejemplo de uso en tu hook useActiveSession
export function exampleUsage() {
  let state: WorkState = 'IDLE';

  // Usuario guarda dirección en DailySetupModal
  const eventSetup = {
    type: 'DAILY_SETUP_SAVED' as const,
    payload: { address: 'Calle 123', clientName: 'Cliente A', coords: { lat: 19.43, lng: -99.13 } },
  };
  const next = transition(state, eventSetup);
  const effects = getSideEffects(state, next, eventSetup);

  if (effects.shouldArmGeofence) {
    armGeofence({
      identifier: 'jornada-actual',
      latitude: eventSetup.payload.coords.lat,
      longitude: eventSetup.payload.coords.lng,
      radius: GEOFENCE_RADIUS,
      notifyOnEnter: true,
      notifyOnExit: true,
    });
  }
  state = next;
}

/*
CHECKLIST PARA MIGRAR DESDE TU V1 ACTUAL:

1. Copia esta carpeta core-v2 a src/core-v2/
2. En src/services/bootWiring.ts importa initCoreV2() y ejecútalo antes de todo
3. Reemplaza workTrackerEngine viejo por transition() + getSideEffects()
4. Elimina toda lógica de distancia > 3.2km - ya no se usa en V1.0.0
5. Implementa el timer de inactividad:
   - Cuando entres a WAITING_DECISION, guarda Date.now()
   - Cada 1 min revisa: si pasaron 15 min sin USER_SELECT_*, dispara INACTIVITY_TIMEOUT
6. Notificación GEOFENCE_EXIT con 2 botones:
   - Acción 1: Otro sitio -> abre DailySetupModal -> evento NEW_WORK_SETUP_SAVED
   - Acción 2: Terminar jornada -> evento USER_SELECT_END_DAY
*/
