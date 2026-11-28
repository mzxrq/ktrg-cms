"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { SerwistProvider, useSerwist } from "@serwist/turbopack/react";
import { refreshSavedPages } from "@/lib/offline-pack";

/**
 * Registers the service worker (src/app/sw.ts) in the built app. A new version takes over quietly when the visitor next goes
 * to another page (2026-11-16, user's manager: the 「新しいバージョンがあります」 bar confused older visitors): the page is
 * changing then anyway, so the reload is not felt, and nothing changes under someone reading or walking (navigation mode
 * resumes after a reload). Not registered in development.
 * `reloadOnOnline` is off: coming back online must not reload a page someone is using (the stamp outbox handles that moment).
 */
export function ServiceWorker() {
  return (
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV !== "production"} reloadOnOnline={false}>
      <QuietUpdate />
    </SerwistProvider>
  );
}

function QuietUpdate() {
  const { serwist } = useSerwist();
  const pathname = usePathname();
  const waiting = useRef(false);
  const first = useRef(pathname);

  useEffect(() => {
    if (!serwist) return;
    const onWaiting = () => {
      waiting.current = true;
    };
    // A new version took over: load it. Not on a first visit, where the first worker taking the page changes nothing on it.
    // The pages saved for offline use name the old version's files, which are gone now: they are fetched again first (at
    // most 8 s, then the reload goes ahead and the old copies stay).
    const onControlling = ({ isUpdate }: { isUpdate?: boolean }) => {
      if (!isUpdate) return;
      const refreshed = navigator.onLine ? refreshSavedPages().catch(() => {}) : Promise.resolve();
      void Promise.race([refreshed, new Promise((done) => setTimeout(done, 8000))]).then(() => window.location.reload());
    };
    serwist.addEventListener("waiting", onWaiting);
    serwist.addEventListener("controlling", onControlling);
    return () => {
      serwist.removeEventListener("waiting", onWaiting);
      serwist.removeEventListener("controlling", onControlling);
    };
  }, [serwist]);

  // The visitor moved to another page: let the waiting version take over now. Not with no signal: the old version's files
  // go, the reload would fail, and every other open tab (one may be stamping) reloads too. It waits for a page change online.
  useEffect(() => {
    if (pathname === first.current) return;
    first.current = pathname;
    if (waiting.current && serwist && navigator.onLine) serwist.messageSkipWaiting();
  }, [pathname, serwist]);

  return null;
}
