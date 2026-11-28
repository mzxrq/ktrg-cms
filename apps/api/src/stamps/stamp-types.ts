import type { ListRow } from "../admin-lists/list-types";
import type { Fix } from "./travel";

export type SpotStatus = "open" | "caution" | "closed" | "info";

/** What the stamping rules need to know about a place. */
export interface StampSpot {
  id: string;
  routeId: string;
  published: boolean;
  stampable: boolean;
  positionVerified: boolean;
  lat: number | null;
  lng: number | null;
  radiusM: number;
  status: SpotStatus;
  /** The waypoint its stamp is pressed at, only while in use (遥拝 always, any other place while closed); lat/lng, radius
   *  and status above are then already that waypoint's. */
  stampSpotId?: string | null;
  /** 道とつながらない (遥拝): its waypoint is always used. Only the in-memory test store reads it; the SQL store works it out. */
  detached?: boolean;
  /** When the status last changed: an offline stamp pressed before a closure is still accepted. */
  statusUpdatedAt?: Date | null;
  /**
   * Only while an on-trail place is closed and stamped at its 閉鎖時のスタンプ地点: when it closed, and its own position and
   * range. A stamp pressed (offline) before then was pressed at the place itself while it was open, so it is checked there.
   */
  closedAt?: Date | null;
  ownLat?: number | null;
  ownLng?: number | null;
  ownRadiusM?: number | null;
}

/** Courses and rallies a stamp has just completed. */
export interface Finished {
  routeIds: string[];
  rallyIds: string[];
}

export interface Awarded {
  /** False when the visitor already held a stamp here: nothing was written. */
  created: boolean;
  createdAt: Date;
  flagged: boolean;
  /** The stamp held here was revoked by an admin: it blocks a new one and is hidden from the visitor's list. */
  revoked: boolean;
  finished: Finished;
}

/**
 * A stamp as the admin list shows it. Stamps are never typed in by hand: they appear when a visitor stamps near a
 * place, so the admin only reads them and revokes or restores one. Member ID and place name, no email or user id.
 * A stamp never changes except by revoking, so `updatedAt` is its creation time.
 */
export interface StampListRow extends ListRow {
  memberId: string;
  spotName: string;
  flagged: boolean;
  flagReason: string | null;
  revoked: boolean;
}

export interface StampStore {
  findSpot(id: string): Promise<StampSpot | null>;
  /** Several places in one query (a guest's whole cookie); an id that is not there is left out. */
  findSpots(ids: string[]): Promise<StampSpot[]>;
  /**
   * The places stamped by the same press as this one (2026-11-20, user): the waypoint a 遥拝 place is worshipped from, and
   * every place worshipped from the same waypoint (or from this one). Not this place itself; checks are the caller's.
   */
  linkedSpots(spot: { id: string; stampSpotId?: string | null }): Promise<(StampSpot & { nameJa: string; nameEn: string | null })[]>;
  /** Saves many stamps for one visitor at once (a guest signing up), each with the time it was earned: one transaction, finishes worked out once at the end. */
  awardMany(userId: string, items: { spotId: string; flagged: boolean; flagReason?: string | null; createdAt: Date }[]): Promise<{ added: number; already: number }>;
  /** Saves the stamp (one per visitor and place) and, in the same transaction, the courses and rallies it finishes. */
  /**
   * `travel` is where and when this stamp was pressed: the store compares it with the visitor's latest stamp that is not
   * revoked and adds `fast_travel` to the flag when no walker could have covered the distance (flag, never block).
   */
  award(userId: string, spotId: string, flag: { flagged: boolean; flagReason: string | null; scannedAt?: Date | null; travel?: Fix }): Promise<Awarded>;
  /** The visitor's own stamps that are not revoked. */
  listMine(userId: string): Promise<{ spotId: string; routeId: string; createdAt: Date }[]>;
  /** When the visitor finished each rally (saved at the moment the last stamp was awarded). */
  listCompletions(userId: string): Promise<{ rallyId: string; completedAt: Date }[]>;
  /** Revokes or restores; the audit row commits with it. Doing it again changes nothing and writes no audit row. */
  setRevoked(actor: string, id: string, revoked: boolean): Promise<"ok" | "not_found">;
}
