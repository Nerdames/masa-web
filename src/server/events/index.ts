import { registerEvents } from "./register";

// Initialize the nervous system immediately upon import
registerEvents();

export { eventBus } from "./bus";
export * from "./types";