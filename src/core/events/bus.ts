import { EventEmitter } from "events";
import { AppEvent, EventPayloads } from "./types";

/**
 * PRODUCTION-READY EVENT BUS
 * Optimized for MASA's real-time notification and audit requirements.
 */
class AppEventBus extends EventEmitter {
  constructor() {
    super();
    // Support high concurrency for mass inventory/system updates
    this.setMaxListeners(100);
  }

  /**
   * Type-safe event emission
   */
  public emitEvent<K extends AppEvent>(event: K, payload: EventPayloads[K]): boolean {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[EventBus:Emit] 📡 Event: ${event} | Timestamp: ${new Date().toISOString()}`);
    }
    return this.emit(event, payload);
  }

  /**
   * Type-safe event subscription with automatic async error boundaries.
   * Ensures that a failure in one handler doesn't halt the event loop.
   */
  public onEvent<K extends AppEvent>(
    event: K,
    listener: (payload: EventPayloads[K]) => void | Promise<void>
  ): this {
    return this.on(event, (payload) => {
      // Use Promise.resolve to wrap both sync and async handlers
      Promise.resolve(listener(payload)).catch((err) => {
        console.error(`[EventBus:CriticalFailure] ${event.toUpperCase()} handler failed:`, {
          error: err instanceof Error ? err.message : err,
          stack: err instanceof Error ? err.stack : undefined,
          payload
        });
      });
    });
  }

  /**
   * Cleans up all system listeners. 
   * Useful for graceful shutdowns or testing environments.
   */
  public clearAll(): void {
    this.removeAllListeners();
    if (process.env.NODE_ENV !== "production") {
      console.warn("[EventBus] ⚠️ All listeners purged.");
    }
  }
}

// Ensure singleton behavior in Next.js development (HMR)
const globalForBus = global as unknown as { eventBus: AppEventBus };
export const eventBus = globalForBus.eventBus || new AppEventBus();

if (process.env.NODE_ENV !== "production") globalForBus.eventBus = eventBus;