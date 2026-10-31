import "expo-notifications";

/** El doble de Jest exporta estas sondas; el paquete real no las declara. */
declare module "expo-notifications" {
  export const __state: {
    permission: { status: string; granted: boolean; canAskAgain: boolean };
    scheduled: { identifier?: string; content: { title?: string; body?: string; data?: Record<string, unknown>; channelId?: string; categoryIdentifier?: string }; trigger: { type?: string; date?: Date } }[];
    dismissed: string[];
    cancelled: string[];
    channels: Map<string, unknown>;
    categories: Map<string, unknown>;
    lastResponse: {
      actionIdentifier: string;
      notification: { request: { identifier: string; content: { data: Record<string, unknown> } } };
    } | null;
  };
  export function __reset(): void;
  export function __emit(response: {
    actionIdentifier: string;
    notification: { request: { identifier: string; content: { data: Record<string, unknown> } } };
  }): void;
  export function __setPermission(status: "granted" | "denied" | "undetermined", canAskAgain?: boolean): void;
}
