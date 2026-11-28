import { useSyncExternalStore } from "react";

/** Chrome's install offer (beforeinstallprompt): not in the DOM types. */
export interface InstallPrompt extends Event {
  prompt(): Promise<void>;
}

// The browser offers the install once, near page load, long before the install steps are opened: it is caught here at
// mount (InstallNudge calls listenForInstallOffer) and kept for whoever shows the button later.
let offer: InstallPrompt | null = null;
const listeners = new Set<() => void>();
let listening = false;

export function listenForInstallOffer(): void {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep the browser's own mini bar away: our button asks instead
    offer = e as InstallPrompt;
    listeners.forEach((l) => l());
  });
  // Installed: the offer is used up.
  window.addEventListener("appinstalled", () => {
    offer = null;
    listeners.forEach((l) => l());
  });
}

/** The install offer kept since page load, or null (iPhone, already installed, or not offered yet). */
export function useInstallOffer(): InstallPrompt | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    () => offer,
    () => null,
  );
}
