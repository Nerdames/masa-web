import { useEffect, useState } from "react";

export function usePersistedState<T>(
  key: string,
  defaultValue: T,
  options?: { parse?: (v: string) => T; stringify?: (v: T) => string }
) {
  const { parse = JSON.parse, stringify = JSON.stringify } = options || {};

  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;
    try {
      return parse(stored);
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(key, stringify(state));
      } catch {
        // Fail silently
      }
    }
  }, [key, state, stringify]);

  return [state, setState] as const;
}
