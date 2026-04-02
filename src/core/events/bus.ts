import { EventEmitter } from "events";
import { AppEvent, EventPayloads } from "./types";

class AppEventBus extends EventEmitter {
  constructor() {
    super();
    // High limit to support mass concurrent operations without Node throwing warnings
    this.setMaxListeners(50);
  }

  public emitEvent<K extends AppEvent>(event: K, payload: EventPayloads[K]): boolean {
    if (process.env.NODE_ENV === "development") {
      console.log(`[EventBus:Emit] 📡 ${event}`, payload);
    }
    return this.emit(event, payload);
  }

  public onEvent<K extends AppEvent>(
    event: K,
    listener: (payload: EventPayloads[K]) => void | Promise<void>
  ): this {
    return this.on(event, (payload) => {
      // Prevents unhandled promise rejections from crashing the Next.js Node process
      Promise.resolve(listener(payload)).catch((err) => {
        console.error(`[EventBus Error] ${event}:`, err);
      });
    });
  }

  public clearAll(): void {
    this.removeAllListeners();
  }
}

export const eventBus = new AppEventBus();