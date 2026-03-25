// src/core/events/register.ts
import { eventBus } from "./bus";
import { 
  handleApprovalRequested, 
  handleApprovalResolved, 
  handleSecurityAlert, 
  handleInventoryAlert 
} from "./handlers";

/**
 * Global flag to prevent duplicate event registration during 
 * Next.js development HMR (Hot Module Replacement).
 */
let isRegistered = false;

/**
 * Registers all application-wide event listeners.
 * This is the "wiring" of the Fortress event system, connecting 
 * the Event Bus to the actual logic handlers.
 */
export function registerEvents() {
  if (isRegistered) return;

  // 1. Approval Workflows
  eventBus.onEvent("approval.requested", handleApprovalRequested);
  eventBus.onEvent("approval.resolved", handleApprovalResolved);

  // 2. Security & Integrity Alerts
  eventBus.onEvent("security.alert", handleSecurityAlert);

  // 3. Operational/Inventory Alerts
  eventBus.onEvent("inventory.alert", handleInventoryAlert);

  isRegistered = true;

  // Only log in development to keep production logs clean
  if (process.env.NODE_ENV === "development") {
    console.log("✔️ [EventBus] All Fortress event handlers registered.");
  }
}