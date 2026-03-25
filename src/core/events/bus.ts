// src/core/events/bus.ts
import { EventEmitter } from "events";
import { AppEvent, EventPayloads } from "./types";

/**
 * AppEventBus
 * A central, type-safe event hub for the MASA v2.0-Fortress architecture.
 * It decouples primary database mutations from secondary side effects 
 * (Notifications, Pusher broadcasts, Audit Logging).
 */
class AppEventBus extends EventEmitter {
  constructor() {
    super();
    // Increase limit for a complex ERP system to prevent memory leak warnings
    // during high-activity periods (e.g., end-of-day reconciliation).
    this.setMaxListeners(20);
  }

  /**
   * Type-safe event emitter.
   * Ensures the payload matches the specific event contract defined in types.ts.
   */
  public emitEvent<K extends AppEvent>(event: K, payload: EventPayloads[K]): boolean {
    if (process.env.NODE_ENV === "development") {
      console.log(`[EventBus:Emit] 📡 ${event}`, payload);
    }
    return this.emit(event, payload);
  }

  /**
   * Type-safe event listener.
   * Automatically handles asynchronous handlers and prevents 
   * event-loop blocking via Promise wrapping.
   */
  public onEvent<K extends AppEvent>(
    event: K,
    listener: (payload: EventPayloads[K]) => void | Promise<void>
  ): this {
    return this.on(event, (payload) => {
      // Execute the listener and catch any floating promises to prevent 
      // Node.js process crashes (Uncaught Rejection).
      Promise.resolve(listener(payload)).catch((err) => {
        console.error(
          `[EventBus:Error] ❌ Failed to process event '${event}':`,
          err instanceof Error ? err.message : err
        );
        
        // In a "Fortress" architecture, we log the failure but do not 
        // block the main execution thread.
      });
    });
  }

  /**
   * Cleans up all listeners. 
   * Useful for testing environments or manual system reloads.
   */
  public clearAll(): void {
    this.removeAllListeners();
  }
}

/**
 * Singleton instance.
 * Next.js can sometimes clear cache in dev; using a global variable 
 * prevents duplicate buses if needed, though a standard export 
 * is usually sufficient for standard builds.
 */
export const eventBus = new AppEventBus();