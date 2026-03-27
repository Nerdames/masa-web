import { AlertAction } from "./types";

/**
 * Returns a stable background color class based on department/branch name hash.
 * Blue is intentionally excluded so blue can be reserved for "primary" markers.
 */
export function getDepartmentColor(name: string = ""): string {
  if (!name) return "bg-slate-300";
  const hash = name.split("").reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
  const colors = [
    "bg-emerald-500",
    "bg-amber-500",
    "bg-purple-500",
    "bg-rose-500",
    "bg-cyan-500",
    "bg-indigo-500",
  ];
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Returns only the text color class for a branch based on its primary status.
 * Primary: Slate-800 (Standard UI Black)
 * Secondary: Slate-500 (Subtle Gray)
 *
 * NOTE: This helper returns color only; font-weight should be applied by the caller.
 */
export function getBranchColor(isPrimary?: boolean): string {
  return isPrimary ? "text-slate-800" : "text-slate-500";
}

/**
 * Generates a cryptographically secure 12-character password.
 */
export function generateSecurePassword(): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  const length = 12;
  const array = new Uint32Array(length);

  if (typeof window !== "undefined" && window.crypto && window.crypto.getRandomValues) {
    window.crypto.getRandomValues(array);
  } else {
    // Fallback to Math.random if crypto is unavailable
    for (let i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * 2 ** 32);
    }
  }

  return Array.from(array)
    .map((val) => charset.charAt(val % charset.length))
    .join("");
}

/**
 * Copies text to clipboard with a robust fallback and dispatches a toast action.
 */
export async function copyToClipboard(text: string, dispatch: (action: AlertAction) => void): Promise<void> {
  const successAction: AlertAction = {
    kind: "TOAST",
    type: "SUCCESS",
    title: "Copied",
    message: "Content copied to clipboard!",
  };

  // Try modern clipboard API first
  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      dispatch(successAction);
      return;
    } catch {
      // fall through to legacy method
    }
  }

  // Legacy fallback using a hidden textarea
  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.appendChild(textArea);

  try {
    textArea.focus();
    textArea.select();
    const successful = document.execCommand("copy");
    if (successful) {
      dispatch(successAction);
    } else {
      throw new Error("Copy command unsuccessful");
    }
  } catch {
    dispatch({
      kind: "TOAST",
      type: "ERROR",
      title: "Copy Failed",
      message: "Please manually copy the text.",
    });
  } finally {
    document.body.removeChild(textArea);
  }
}
