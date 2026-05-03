/**
 * Firestore Analytics Logger
 * --------------------------------------------------
 * Writes structured provider-switch and circuit-breaker
 * events to the `ai_analytics` collection in Firestore.
 *
 * All writes are fire-and-forget (no await) so they never
 * block the response path.
 */
import { firestoreDB } from "./firebase-admin";
import type { AnalyticsEvent, ProviderName } from "./types";

const COLLECTION = "ai_analytics";

function log(event: AnalyticsEvent): void {
  // Fire-and-forget — failures are silent so they never surface to the user
  firestoreDB
    .collection(COLLECTION)
    .add({
      ...event,
      timestamp: event.timestamp.toISOString(),
    })
    .catch((err: unknown) => {
      console.error("[Analytics] Firestore write failed:", err);
    });
}

export const analytics = {
  providerSwitch(params: {
    from: ProviderName | null;
    to: ProviderName;
    reason: string;
    sessionId?: string;
  }): void {
    log({
      type: "provider_switch",
      provider: params.to,
      detail: {
        fromProvider: params.from,
        reason: params.reason,
        sessionId: params.sessionId ?? null,
      },
      timestamp: new Date(),
    });
  },

  circuitOpen(provider: ProviderName, disabledUntil: Date): void {
    log({
      type: "circuit_open",
      provider,
      detail: { disabledUntil: disabledUntil.toISOString() },
      timestamp: new Date(),
    });
  },

  circuitClose(provider: ProviderName): void {
    log({
      type: "circuit_close",
      provider,
      detail: {},
      timestamp: new Date(),
    });
  },

  requestSuccess(provider: ProviderName, latencyMs: number): void {
    log({
      type: "request_success",
      provider,
      detail: { latencyMs },
      timestamp: new Date(),
    });
  },

  requestError(provider: ProviderName, error: string): void {
    log({
      type: "request_error",
      provider,
      detail: { error },
      timestamp: new Date(),
    });
  },
};
