import { eventBus } from "./bus";
import { 
  handleApprovalRequested, 
  handleApprovalResolved, 
  handleSecurityAlert, 
  handleInventoryAlert 
} from "./handlers";

let isRegistered = false;

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

  if (process.env.NODE_ENV === "development") {
    console.log("✔️ [EventBus] All Fortress event handlers registered.");
  }
}

export function clearEvents() {
  eventBus.clearAll();
  isRegistered = false;
}