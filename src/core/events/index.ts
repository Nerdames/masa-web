// src/core/events/index.ts
import { registerEvents } from "./register";

// Initialize the nervous system
registerEvents();

export { eventBus } from "./bus";
export * from "./types";