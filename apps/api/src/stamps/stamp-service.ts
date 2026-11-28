import type { Result } from "../content/content-types";
import { distanceMeters } from "../lib/geo";
import type { Finished, StampSpot, StampStore } from "./stamp-types";

/** A reading worse than this is refused; from FLAG_ACCURACY_M up it is accepted but flagged for review. */
export const MAX_ACCURACY_M = 100;
export const FLAG_ACCURACY_M = 50;

export interface Reading {
  spotId: string;
  lat: number;
  lng: number;
  accuracyM: number;
  /** ISO time the phone pressed the stamp, sent only when it was queued offline. Checked, not trusted. */
  scannedAt?: string;
}

/** A queued stamp may be this old when it is uploaded, and no more than this far ahead of the server's clock. */
export const MAX_SCAN_AGE_MS = 48 * 60 * 60 * 1000;
export const MAX_SCAN_AHEAD_MS = 5 * 60 * 1000;

export interface Collected {
  spotId: string;
  createdAt: Date;
  flagged: boolean;
  alreadyStamped: boolean;
  finished: Finished;
  /** Other places stamped by the same press (遥拝, see StampStore.linkedSpots), newly or already held. */
  also: AlsoStamped[];
}

export interface AlsoStamped {
  spotId: string;
  nameJa: string;
  nameEn: string | null;
  alreadyStamped: boolean;
}

/**
 * The stamping rules. The server decides: the phone only reports where it is. The reading is used for the checks
 * and then dropped (a stamp stores no coordinates, and nothing here logs them).
 */
/** A place a visitor can head for and stamp: published, a stamp place, with a checked position. */
type StampPlace = StampSpot & { lat: number; lng: number };

// A draft, a navigation point and a place without a checked position all look like a place that is not there.
const isStampPlace = (spot: StampSpot | null): spot is StampPlace =>
  !!spot && spot.published && spot.stampable && spot.status !== "info" && spot.positionVerified && spot.lat !== null && spot.lng !== null;

/** The place checks of a stamp (open, close enough, accurate enough), shared by an account's stamp and a guest's. */
async function check(r: Reading, store: StampStore, now: Date): Promise<Result<{ spot: StampPlace; flagged: boolean; scannedAt: Date | null }>> {
  const found = await store.findSpot(r.spotId);
  let scannedAt: Date | null = null;
  if (r.scannedAt !== undefined) {
    scannedAt = new Date(r.scannedAt);
    if (Number.isNaN(scannedAt.getTime()) || scannedAt.getTime() > now.getTime() + MAX_SCAN_AHEAD_MS) return { ok: false, reason: "bad_time" };
    if (scannedAt.getTime() < now.getTime() - MAX_SCAN_AGE_MS) return { ok: false, reason: "stale_scan" };
  }
  // Pressed (offline) at a closed on-trail place before it closed: it was open there then, so its own position decides.
  const pressedBeforeClosing = !!(found && scannedAt && found.closedAt && scannedAt < found.closedAt && found.ownLat != null && found.ownLng != null);
  const spot: StampSpot | null =
    found && pressedBeforeClosing ? { ...found, lat: found.ownLat!, lng: found.ownLng!, radiusM: found.ownRadiusM ?? found.radiusM, status: "open", stampSpotId: null } : found;
  if (!isStampPlace(spot)) return { ok: false, reason: "not_found" };
  // Closed now: refused, unless the phone pressed the stamp before the closure was set (it was open when they stood there).
  if (spot.status === "closed" && !(scannedAt && spot.statusUpdatedAt && scannedAt < spot.statusUpdatedAt)) return { ok: false, reason: "spot_closed" };
  if (r.accuracyM > MAX_ACCURACY_M) return { ok: false, reason: "gps_accuracy_poor" };
  if (distanceMeters({ lat: r.lat, lng: r.lng }, { lat: spot.lat, lng: spot.lng }) > spot.radiusM) {
    return { ok: false, reason: "too_far" };
  }
  return { ok: true, value: { spot, flagged: r.accuracyM >= FLAG_ACCURACY_M, scannedAt } };
}

export function createStampService({ store, now = () => new Date() }: { store: StampStore; now?: () => Date }) {
  /** The other places this press also stamps, each passing the same checks with the same reading (遥拝 links). */
  async function linked(r: Reading, spot: StampSpot): Promise<{ spot: StampPlace; flagged: boolean; nameJa: string; nameEn: string | null }[]> {
    const out: { spot: StampPlace; flagged: boolean; nameJa: string; nameEn: string | null }[] = [];
    for (const other of await store.linkedSpots(spot)) {
      const c = await check({ ...r, spotId: other.id }, store, now());
      if (c.ok) out.push({ spot: c.value.spot, flagged: c.value.flagged, nameJa: other.nameJa, nameEn: other.nameEn });
    }
    return out;
  }

  return {
    /** The place, if visitors may head for it and stamp it (also used by navigation); null otherwise. */
    async stampPlace(spotId: string): Promise<StampPlace | null> {
      const spot = await store.findSpot(spotId);
      return isStampPlace(spot) ? spot : null;
    },

    /** The stamp places among these ids, in one query; an id that is not (or no longer) a stamp place is left out. */
    async stampPlaces(spotIds: string[]): Promise<Map<string, StampPlace>> {
      const found = (await store.findSpots([...new Set(spotIds)])).filter(isStampPlace);
      return new Map(found.map((s) => [s.id, s]));
    },

    check: (r: Reading) => check(r, store, now()),

    linked,

    /** Saves a stamp whose checks were already done (a guest's, once they sign up). */
    awardMany: (userId: string, items: { spotId: string; flagged: boolean; flagReason?: string | null; createdAt: Date }[]) => store.awardMany(userId, items),
    award: (userId: string, spotId: string, flagged: boolean) => store.award(userId, spotId, { flagged, flagReason: flagged ? "low_accuracy" : null }),

    async collect(userId: string, r: Reading): Promise<Result<Collected>> {
      const checked = await check(r, store, now());
      if (!checked.ok) return checked;
      const { spot, flagged, scannedAt } = checked.value;
      const got = await store.award(userId, spot.id, { flagged, flagReason: flagged ? "low_accuracy" : null, scannedAt, travel: { lat: spot.lat, lng: spot.lng, at: scannedAt ?? now() } });
      // A revoked stamp stays on record and blocks a new one; say so instead of "already stamped" with nothing to show.
      if (got.revoked) return { ok: false, reason: "stamp_revoked" };
      const finished: Finished = { routeIds: [...got.finished.routeIds], rallyIds: [...got.finished.rallyIds] };
      const also: AlsoStamped[] = [];
      for (const o of await linked(r, spot)) {
        const more = await store.award(userId, o.spot.id, { flagged: o.flagged, flagReason: o.flagged ? "low_accuracy" : null, scannedAt });
        if (more.revoked) continue;
        also.push({ spotId: o.spot.id, nameJa: o.nameJa, nameEn: o.nameEn, alreadyStamped: !more.created });
        finished.routeIds.push(...more.finished.routeIds.filter((id) => !finished.routeIds.includes(id)));
        finished.rallyIds.push(...more.finished.rallyIds.filter((id) => !finished.rallyIds.includes(id)));
      }
      return {
        ok: true,
        value: { spotId: spot.id, createdAt: got.createdAt, flagged: got.flagged, alreadyStamped: !got.created, finished, also },
      };
    },

    listMine: (userId: string) => store.listMine(userId),
    listCompletions: (userId: string) => store.listCompletions(userId),
    async setRevoked(actor: string, id: string, revoked: boolean): Promise<Result<true>> {
      return (await store.setRevoked(actor, id, revoked)) === "ok" ? { ok: true, value: true } : { ok: false, reason: "not_found" };
    },
  };
}

export type StampService = ReturnType<typeof createStampService>;
