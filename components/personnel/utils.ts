import { AlertAction } from "./types";

/**
 * Returns a stable background color class based on department/branch name hash.
 */
export function getDepartmentColor(name: string): string {
  const hash = name.split("").reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
  const colors = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-purple-500", "bg-rose-500", "bg-cyan-500"];
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Returns the text color for a branch based on its primary status.
 * Primary: Blue-700 | Secondary: Red-600
 */
export function getBranchColor(isPrimary?: boolean): string {
  return isPrimary ? "text-blue-700 font-bold" : "text-red-600 font-medium";
}

/**
 * Generates a cryptographically secure 12-character password.
 */
export function generateSecurePassword(): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  const array = new Uint32Array(12);
  window.crypto.getRandomValues(array);
  
  return Array.from(array)
    .map((val) => charset[val % charset.length])
    .join("");
}

/**
 * Copies text to clipboard with a fallback for older browsers or non-secure contexts.
 */
export async function copyToClipboard(text: string, dispatch: (action: AlertAction) => void): Promise<void> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Copied", message: "Password copied to clipboard!" });
    } else {
      throw new Error("Clipboard API unavailable");
    }
  } catch (err: unknown) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    // Ensure the textarea is off-screen to prevent layout shift
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
      dispatch({ kind: "TOAST", type: "SUCCESS", title: "Copied", message: "Password copied to clipboard!" });
    } catch (fallbackErr: unknown) {
      dispatch({ kind: "TOAST", type: "ERROR", title: "Copy Failed", message: "Please manually copy the password." });
    }
    document.body.removeChild(textArea);
  }
}