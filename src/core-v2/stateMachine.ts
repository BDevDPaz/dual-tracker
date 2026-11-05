// core-v2/stateMachine.ts - Máquina de estados pura, sin efectos secundarios
// Esta es la verdad única de tu lógica de negocio. No hay 3.2km aquí.

import { WorkState, WorkEvent } from './types';

export function transition(state: WorkState, event: WorkEvent): WorkState {
  switch (state) {
    case 'IDLE':
      if (event.type === 'DAILY_SETUP_SAVED') return 'GEOFENCE_ARMED';
      return state;

    case 'GEOFENCE_ARMED':
      if (event.type === 'GEOFENCE_ENTRY') return 'ACTIVE_SESSION';
      // Si el usuario cancela y vuelve a configurar, sigue armado
      if (event.type === 'DAILY_SETUP_SAVED') return 'GEOFENCE_ARMED';
      return state;

    case 'ACTIVE_SESSION':
      if (event.type === 'GEOFENCE_EXIT') return 'WAITING_DECISION';
      return state;

    case 'WAITING_DECISION':
      if (event.type === 'USER_SELECT_NEW_WORK') return 'TRAVEL';
      if (event.type === 'USER_SELECT_END_DAY') return 'DAY_FINISHED';
      if (event.type === 'INACTIVITY_TIMEOUT') return 'DAY_FINISHED';
      return state;

    case 'TRAVEL':
      // En TRAVEL ya armaste la nueva geocerca
      if (event.type === 'NEW_WORK_SETUP_SAVED') return 'GEOFENCE_ARMED';
      if (event.type === 'GEOFENCE_ENTRY') return 'ACTIVE_SESSION'; // llegó directo al otro sitio
      if (event.type === 'USER_SELECT_END_DAY') return 'DAY_FINISHED';
      return state;

    case 'DAY_FINISHED':
      if (event.type === 'DAILY_SETUP_SAVED') return 'GEOFENCE_ARMED'; // nuevo día o reinicio
      return state;

    default:
      return state;
  }
}

// Helper para saber qué hacer después de cada transición
export function getSideEffects(prev: WorkState, next: WorkState, event: WorkEvent) {
  return {
    shouldCreateSession: prev === 'GEOFENCE_ARMED' && next === 'ACTIVE_SESSION',
    shouldCloseSession: (prev === 'WAITING_DECISION' && next === 'DAY_FINISHED') || event.type === 'INACTIVITY_TIMEOUT',
    shouldStartTravel: prev === 'WAITING_DECISION' && next === 'TRAVEL',
    shouldArmGeofence: event.type === 'DAILY_SETUP_SAVED' || event.type === 'NEW_WORK_SETUP_SAVED',
    shouldNotifyExit: prev === 'ACTIVE_SESSION' && next === 'WAITING_DECISION',
    shouldAutoCheckout: event.type === 'INACTIVITY_TIMEOUT',
  };
}
