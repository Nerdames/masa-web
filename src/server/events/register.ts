import { eventBus } from "./bus";
import { 
  handleApprovalRequested, 
  handleApprovalResolved, 
  handleSecurityAlert, 
  handleInventoryAlert 
} from "./handlers";

/**
 * Tracks registration state to prevent duplicate attachment of handlers.
 */
let isRegistered = false;

/**
 * PRIMARY REGISTRATION POINT
 * This should be called in the main entry point of the server or in a 
 * global singleton initialization utility.
 */
export function registerEvents() {
  if (isRegistered) return;

  // 1. APPROVAL WORKFLOWS
  // Manages the routing of authorization requests to correct authority levels
  eventBus.onEvent("approval.requested", handleApprovalRequested);
  eventBus.onEvent("approval.resolved", handleApprovalResolved);

  // 2. SECURITY & INTEGRITY
  // High-priority broadcast for suspicious activities or failed logins
  eventBus.onEvent("security.alert", handleSecurityAlert);

  // 3. OPERATIONAL & INVENTORY
  // Localized alerts for stock levels and procurement cycles
  eventBus.onEvent("inventory.alert", handleInventoryAlert);

  isRegistered = true;

  if (process.env.NODE_ENV !== "production") {
    console.log("✔️ [EventBus] MASA Production Handlers successfully wired.");
  }
}

/**
 * Resets the event registry. 
 * Used primarily for hot-reload cleanup and unit testing.
 */
export function clearEvents() {
  eventBus.clearAll();
  isRegistered = false;
}