type EventHandler<T = any> = (payload: T) => Promise<void> | void;

class EventBus {
  private handlers: Map<string, EventHandler[]> = new Map();

  on(event: string, handler: EventHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }

    this.handlers.get(event)!.push(handler);
  }

  async emit(event: string, payload: any) {
    const handlers = this.handlers.get(event);

    if (!handlers) return;

    await Promise.all(
      handlers.map(async (handler) => {
        try {
          await handler(payload);
        } catch (err) {
          console.error(`[EventBus][${event}]`, err);
        }
      })
    );
  }
}

export const eventBus = new EventBus();