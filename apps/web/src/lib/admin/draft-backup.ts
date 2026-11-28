import type { PlaceDraft, RouteDraft } from "./route-draft";

// A copy of the route being edited, kept in this browser while it has changes that are not saved, so a failed save, a crash or
// a closed tab does not cost the work. It lives only on this device (the page's own storage), holds only what the editor
// shows, and is removed as soon as everything is saved. Pure apart from the storage it is given, so it is tested without a browser.

export interface Backup {
  /** When the copy was made (ISO). */
  at: string;
  /** The update time of the saved route the edits started from: a copy of an older version is not offered. */
  base: string | null;
  draft: RouteDraft;
  /** A save of these edits was refused because someone saved first (409): offered even though the route has moved on. */
  conflict?: boolean;
  /** With `conflict`: the saved copy the edits started from, so restoring keeps what the other person saved meanwhile. */
  from?: RouteDraft;
}

export const backupKey = (routeId: string | null) => `route-draft-backup:${routeId ?? "new"}`;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The copy as stored text, or null when none is kept or it is not one of ours. */
export function parseBackup(raw: string | null): Backup | null {
  if (!raw) return null;
  try {
    const b = JSON.parse(raw) as Partial<Backup> | null;
    if (b && typeof b.at === "string" && (b.base === null || typeof b.base === "string") && b.draft && Array.isArray(b.draft.places) && Array.isArray(b.draft.legs)) return b as Backup;
  } catch {
    // not ours
  }
  return null;
}

/** Keep the copy (or drop it when there is nothing unsaved). Storage that is full or blocked is no reason to stop editing. */
export function writeBackup(store: Store, draft: RouteDraft, base: string | null, unsaved: boolean, now = new Date(), conflictFrom?: RouteDraft): void {
  try {
    const conflict = conflictFrom ? { conflict: true, from: conflictFrom } : {};
    if (unsaved) store.setItem(backupKey(draft.id), JSON.stringify({ at: now.toISOString(), base, draft, ...conflict } satisfies Backup));
    else {
      store.removeItem(backupKey(draft.id));
      store.removeItem(backupKey(null)); // a route that was new and has now been saved leaves no copy under "new"
    }
  } catch {
    // not kept this time
  }
}

/** Whether a stored copy is worth offering: it started from this saved version (or lost a save conflict) and differs from it. */
export const worthRestoring = (b: Backup | null, saved: RouteDraft): b is Backup =>
  b !== null && (b.base === saved.updatedAt || b.conflict === true) && JSON.stringify(b.draft) !== JSON.stringify(saved);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Field by field: what the person changed (mine differs from where they started) wins, the rest is the server's. */
function mergeFields<T extends object>(mine: T, from: T, server: T): T {
  const out = { ...server };
  for (const k of Object.keys(mine) as (keyof T)[]) if (!same(mine[k], from[k])) out[k] = mine[k];
  return out;
}

/**
 * The copy brought back onto what the server holds now (a three-way merge with the saved copy the edits started from):
 * the person's own changes win, everything they did not touch keeps what was saved meanwhile, and the server's times and
 * published state are taken, so the next save is not refused again. Without `from` (no conflict) the copy started from
 * this very version, and it comes back as it is.
 */
export function restoreOnto(b: Backup, server: RouteDraft): RouteDraft {
  const mine = b.draft;
  const from = b.from ?? server;
  // The line, its legs and the waypoints are settled below; the spare legs of a reorder belong to that editing session.
  const route: RouteDraft = { ...mergeFields(mine, from, server), id: server.id, updatedAt: server.updatedAt };
  delete route.spareLegs;
  // The line and its legs go together: the person's drawing if they changed it, else the server's.
  const drawn = same(mine.line, from.line) && same(mine.legs, from.legs) ? { line: server.line, legs: server.legs } : { line: mine.line, legs: mine.legs };

  const byId = (list: PlaceDraft[]) => new Map(list.flatMap((p) => (p.id ? [[p.id, p] as const] : [])));
  const fromPlaces = byId(from.places);
  const serverPlaces = byId(server.places);
  const places: PlaceDraft[] = [];
  for (const p of mine.places) {
    const was = p.id ? fromPlaces.get(p.id) : undefined;
    const now = p.id ? serverPlaces.get(p.id) : undefined;
    if (!p.id || !was) places.push(p); // added by the person
    else if (now) places.push({ ...mergeFields(p, was, now), key: p.key, id: now.id, updatedAt: now.updatedAt, published: now.published });
    else if (!same(p, was)) places.push({ ...p, id: null, updatedAt: null, published: false }); // deleted meanwhile, but edited here: kept as new
    // deleted meanwhile and not touched here: stays deleted
  }
  // Waypoints the other person added (not in the copy's start, not removed here) are kept.
  const mineIds = new Set(mine.places.map((p) => p.id));
  for (const p of server.places) if (p.id && !fromPlaces.has(p.id) && !mineIds.has(p.id)) places.push(p);
  return { ...route, ...drawn, places };
}

/** Reads the stored copy the first time only: what was there when the editor opened, never the copy this visit writes a second later. */
export function firstRead(read: () => string | null): () => string | null {
  let seen: string | null | undefined;
  return () => {
    if (seen === undefined) {
      try {
        seen = read();
      } catch {
        seen = null; // storage blocked (private window, for example)
      }
    }
    return seen;
  };
}
