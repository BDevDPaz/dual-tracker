import { now, nowIso as getNowIso } from "../utils/timeProvider";
import {
  DomainEvent,
  WorkTrackerCanonicalState,
  WorkTrackerRuntimeAdapter,
  SystemLogRecord,
} from "./contracts";
import { createInitialState } from "./state";
import { workTrackerReducer } from "./reducer";
import { executeEffects } from "./effects";

/**
 * Serializa un error o valor desconocido a string de forma segura.
 * Maneja objetos circulares, errores de JSON.stringify y tipos primitivos.
 */
export function serializeError(error: unknown): string {
  try {
    if (error === null) return "null";
    if (error === undefined) return "undefined";

    if (typeof error === "boolean" || typeof error === "number") {
      return String(error);
    }

    if (typeof error === "string") {
      return error;
    }

    if (error instanceof Error) {
      return JSON.stringify(
        {
          name: error.name,
          message: error.message,
          stack: error.stack,
          // @ts-ignore - cause existe en entornos modernos
          cause: error.cause,
        },
        null,
        0,
      );
    }

    if (typeof error === "object") {
      const cache = new Set();

      return JSON.stringify(
        error,
        (_key, value) => {
          if (typeof value === "object" && value !== null) {
            if (cache.has(value)) {
              return "[Circular]";
            }

            cache.add(value);
          }

          return value;
        },
        0,
      );
    }

    return String(error);
  } catch (e) {
    try {
      return `[Serialization Error: ${String(e)}] Original: ${String(error)}`;
    } catch {
      return "[Unserializable Error]";
    }
  }
}

function buildSystemErrorLog(
  eventType: string,
  error: unknown,
  currentState: WorkTrackerCanonicalState,
): SystemLogRecord {
  const message =
    error instanceof Error ? error.message : `Error desconocido despachando evento ${eventType}`;

  return {
    user_id: null,
    session_id: null,
    event_type: eventType,
    from_state: null,
    to_state: null,
    location: null,
    device_state: null,
    trigger_source: "WORK_TRACKER_ENGINE",
    reason: message,
    signature: null,
    event_state: "ERROR",
    sync_status: "PENDING",

    id: currentState.domain.audit.systemLogs.length + 1,
    timestampMs: now(),
    timestampIso: getNowIso(),
    color: "ROJO",
    category: "ERROR_CRITICO",
    severity: "ERROR",
    message: `Error en WorkTrackerEngine durante ${eventType}: ${message}`,
    metadataJson: serializeError(error),
  };
}

/**
 * WorkTrackerEngine
 */
class WorkTrackerEngine {
  private state: WorkTrackerCanonicalState;
  private runtimeAdapter: WorkTrackerRuntimeAdapter | null;
  private isDrainingQueue: boolean;
  private readonly eventQueue: DomainEvent[];
  private hasWarnedMissingRuntime: boolean;
  private readonly listeners: Set<(state: WorkTrackerCanonicalState) => void>;

  constructor() {
    this.state = createInitialState();
    this.runtimeAdapter = null;
    this.isDrainingQueue = false;
    this.eventQueue = [];
    this.hasWarnedMissingRuntime = false;
    this.listeners = new Set();
  }

  public initialize(runtime: WorkTrackerRuntimeAdapter): void {
    this.runtimeAdapter = runtime;
    this.hasWarnedMissingRuntime = false;
  }

  public getState(): WorkTrackerCanonicalState {
    return this.state;
  }

  public isInitialized(): boolean {
    return this.runtimeAdapter !== null;
  }

  public resetState(): void {
    this.state = createInitialState();
    this.eventQueue.length = 0;
    this.isDrainingQueue = false;
    this.notifyListeners();
  }

  public subscribe(listener: (state: WorkTrackerCanonicalState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const currentState = this.getState();

    this.listeners.forEach((listener) => {
      try {
        listener(currentState);
      } catch (error) {
        if (__DEV__) {
          console.error("[WorkTrackerEngine] Error in listener:", error);
        }
      }
    });
  }

  public async dispatch(event: DomainEvent): Promise<void> {
    this.eventQueue.push(event);
    await this.drainQueue();
  }

  private async drainQueue(): Promise<void> {
    if (this.isDrainingQueue) {
      return;
    }

    this.isDrainingQueue = true;

    try {
      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift();

        if (!event) {
          continue;
        }

        await this.processEvent(event);
      }
    } finally {
      this.isDrainingQueue = false;
    }
  }

  private async processEvent(event: DomainEvent): Promise<void> {
    const prevState = this.state;

    try {
      if (!this.runtimeAdapter && !this.hasWarnedMissingRuntime) {
        this.hasWarnedMissingRuntime = true;
        console.warn(
          "[WorkTrackerEngine] El motor está procesando eventos sin runtime inicializado.",
        );
      }

      const nextState = workTrackerReducer(prevState, event);

      this.state = nextState;
      this.notifyListeners();

      if (this.runtimeAdapter) {
        const secondaryEvents = await executeEffects(
          event,
          prevState,
          nextState,
          this.runtimeAdapter,
        );

        if (Array.isArray(secondaryEvents) && secondaryEvents.length > 0) {
          this.eventQueue.push(...secondaryEvents);
        }
      }
    } catch (error) {
      if (__DEV__) {
        console.error(`[WorkTrackerEngine] Error crítico despachando ${event.type}:`, error);
      }

      const isAlreadyErrorPath =
        event.type === "SYSTEM_ERROR_RECORDED" || event.type === "SYSTEM_LOG_APPENDED";

      if (isAlreadyErrorPath) {
        return;
      }

      const errorLogEntry = buildSystemErrorLog(event.type, error, prevState);

      this.eventQueue.push({
        type: "SYSTEM_ERROR_RECORDED",
        entry: errorLogEntry,
      });

      this.eventQueue.push({
        type: "SYSTEM_LOG_APPENDED",
        entry: errorLogEntry,
      });
    }
  }
}

export const workTrackerEngine = new WorkTrackerEngine();
