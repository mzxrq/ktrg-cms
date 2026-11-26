"use client";

import { useSyncExternalStore } from "react";
import { useLingui } from "@lingui/react/macro";
import { usePresence } from "@/lib/motion";

// "No signal" bar (WBS 3.5.5). Mountain signal comes and goes, so the app says so plainly instead of leaving the
// visitor to wonder why a button does nothing. It follows the browser's online and offline events; the offline
// pack itself (saved maps and queued stamps) is Phase B and not built yet, so this only informs.
function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function OfflineNotice() {
  const { t } = useLingui();
  // On the server, and before the browser has answered, assume there is a connection.
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  // The bar slides in and out of the page flow (lib/motion), so the page below it moves smoothly.
  const { mounted, ref } = usePresence<HTMLDivElement>(!online, "collapse");
  if (!mounted) return null;

  return (
    <div ref={ref} role="status" data-fab-room data-offline-notice className="sticky top-[var(--top-clear)] z-40 mb-3 bg-ink px-4 py-3 text-center text-lg font-bold text-paper">
      {t`オフラインです。接続が回復すると再び利用できます。`}
    </div>
  );
}
