// The stamps waiting to be sent, as one object the screens share (Phase B, slice B3; see docs/phase-b-offline-plan.md).
//
// A stamp pressed with no signal is written to the queue (lib/stamp-queue.ts) with the position read at the press, and
// sent when the app is online again. The server still decides. This file is the glue: it knows whose stamps these are,
// keeps the count the screens show, and runs the upload under a lock so two tabs do not send the same row.

import { useSyncExternalStore } from "react";
import { createIdbQueueStore, flushQueue, MAX_QUEUE_AGE_MS, newQueuedStamp, withUploadLock, type FlushResult, type Outcome, type QueuedStamp, type QueueStore } from "./stamp-queue";
import { requestStampFor } from "./stamp-client";
import type { Reading, StampResult } from "./stamp-flow";

/** The server refuses a reading rougher than this (gps_accuracy_poor), so such a reading is never kept to send later. */
export const MAX_ACCURACY_M = 100;
export const canQueue = (reading: Reading) => reading.accuracyM <= MAX_ACCURACY_M;

export interface OutboxDeps {
  store: QueueStore;
  send: (userKey: string, row: { spotId: string; lat: number; lng: number; accuracyM: number; scannedAt: string }) => Promise<StampResult>;
  now: () => Date;
  /** Runs `fn` unless another tab is already uploading. */
  lock: <T>(fn: () => Promise<T>) => Promise<{ ran: true; value: T } | { ran: false }>;
}

export function createOutbox(deps: OutboxDeps) {
  let userKey = "guest";
  let pending = 0;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  async function refresh() {
    try {
      pending = (await deps.store.list(userKey)).length;
    } catch {
      pending = 0; // storage blocked: nothing can be waiting here
    }
    notify();
  }

  return {
    /** Whose stamps these are: the account's id, or "guest". Set by the layout; a row never uploads under another key. */
    async setUser(key: string) {
      userKey = key;
      // Rows hold coordinates and must not outlive the upload window, also those of an account signed out on this phone.
      try {
        const now = deps.now().getTime();
        for (const r of await deps.store.all()) if (now - Date.parse(r.scannedAt) > MAX_QUEUE_AGE_MS) await deps.store.remove(r.id);
      } catch {
        // storage blocked: nothing is kept here anyway
      }
      await refresh();
    },
    /** Writes the stamp to the queue. False when it could not be kept (storage blocked or full): the screen must say so. */
    async enqueue(spotId: string, reading: Reading, celebrate?: QueuedStamp["celebrate"]): Promise<boolean> {
      try {
        // Pressed again while it waits: the first press is the one that counts, as it was the earlier time at the place, unless
        // the waiting one is a reading the server would refuse (kept by an older version): the better press replaces it.
        const waiting = (await deps.store.list(userKey)).find((r) => r.spotId === spotId);
        if (waiting && !canQueue(waiting)) await deps.store.remove(waiting.id);
        if (!waiting || !canQueue(waiting)) await deps.store.add(newQueuedStamp(userKey, spotId, reading, deps.now(), undefined, celebrate));
      } catch {
        return false;
      }
      await refresh();
      return true;
    },
    /** The places with a stamp waiting on this phone. */
    async waitingSpots(): Promise<string[]> {
      try {
        return (await deps.store.list(userKey)).map((r) => r.spotId);
      } catch {
        return [];
      }
    },
    /** How many stamps pressed before signing in (kept as "guest") are still waiting on this phone. */
    async guestWaiting(): Promise<number> {
      try {
        return (await deps.store.list("guest")).length;
      } catch {
        return 0;
      }
    },
    /** Moves the waiting guest stamps to the current account, so they are sent as its own. No-op for "guest" itself. */
    async adoptGuest(): Promise<number> {
      if (userKey === "guest") return 0;
      const rows = await deps.store.list("guest");
      for (const r of rows) await deps.store.update(r.id, { userKey });
      await refresh();
      return rows.length;
    },
    /** Drops the waiting guest stamps (the visitor chose not to send them to the account). */
    async discardGuest(): Promise<void> {
      for (const r of await deps.store.list("guest")) await deps.store.remove(r.id);
      await refresh();
    },
    /** Sends what is waiting. `ran` is false when another tab is already doing it. */
    async flush(): Promise<{ ran: boolean; result: FlushResult | null }> {
      const key = userKey;
      const got = await deps.lock(() => flushQueue({ store: deps.store, userKey: key, send: (row) => deps.send(key, row), now: deps.now }));
      await refresh();
      return got.ran ? { ran: true, result: got.value } : { ran: false, result: null };
    },
    get pending() {
      return pending;
    },
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
  };
}

export type Outbox = ReturnType<typeof createOutbox>;
export type { Outcome };

let instance: Outbox | null = null;

/** The one outbox of this page, made on first use (browser only: it opens IndexedDB). */
export function getOutbox(): Outbox {
  instance ??= createOutbox({
    store: createIdbQueueStore(),
    send: (userKey, row) => requestStampFor(userKey, row.spotId, { lat: row.lat, lng: row.lng, accuracyM: row.accuracyM }, row.scannedAt),
    now: () => new Date(),
    lock: withUploadLock,
  });
  return instance;
}

/** How many stamps are waiting to be sent (0 on the server and before the first read). */
export function usePendingStamps(): number {
  return useSyncExternalStore(
    (cb) => getOutbox().subscribe(cb),
    () => getOutbox().pending,
    () => 0,
  );
}
