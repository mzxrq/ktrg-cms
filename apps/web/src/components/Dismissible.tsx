"use client";

import type { ReactNode } from "react";
import { useState, useSyncExternalStore } from "react";
import { useLingui } from "@lingui/react/macro";
import { XIcon } from "@/components/icons";
import { usePresence } from "@/lib/motion";

// A notice the visitor can close for good on this device: only a flag in localStorage (never anything about the person), read
// with try/catch because it can throw or come back empty (private window, blocked site data). Closing in one place closes
// every copy on the page, through the event below.
const EVENT = "ktrg-dismissed";

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** `children` with a close button at the end. Rendered by the server as open; hidden after hydration if it was closed before. */
export function Dismissible({ storageKey, className = "", children }: { storageKey: string; className?: string; children: ReactNode }) {
  const { t } = useLingui();
  const dismissed = useSyncExternalStore(subscribe, () => read(storageKey), () => false);
  // It collapses out of the page only when the visitor closes it here; one closed before is simply not drawn.
  const [closedHere, setClosedHere] = useState(false);
  const { mounted, ref } = usePresence<HTMLDivElement>(!dismissed, "collapse");
  if (!mounted || (dismissed && !closedHere)) return null;

  function close() {
    setClosedHere(true);
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // Nothing stored: it stays closed until the page is left (the event below hides every copy for now).
    }
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <div ref={ref} className={`flex items-center justify-between gap-2 ${className}`}>
      <div className="min-w-0">{children}</div>
      <button type="button" onClick={close} aria-label={t`閉じる`} className="tap-target -mr-2 inline-flex shrink-0 items-center justify-center">
        <XIcon />
      </button>
    </div>
  );
}
