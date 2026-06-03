import { useCallback, useEffect, useState } from "react";

const KEY_PREFIX = "sightline:prompt-dismissed:";

/**
 * Tracks dismissal of a one-line guidance prompt in localStorage.
 * Returns { visible, dismiss } — visible is true when not dismissed and `condition` is true.
 */
export function useDismissiblePrompt(key: string, condition: boolean = true): {
  visible: boolean;
  dismiss: () => void;
} {
  const storageKey = KEY_PREFIX + key;
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setDismissed(window.localStorage.getItem(storageKey) === "1");
  }, [storageKey]);
  const dismiss = useCallback(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(storageKey, "1");
    setDismissed(true);
  }, [storageKey]);
  return { visible: condition && !dismissed, dismiss };
}