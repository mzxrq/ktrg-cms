import { and, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { writeAudit } from "../audit/audit-store";
import type { Db } from "../db/client";
import { courseCompletions, rallyCompletions, spots, spotTranslations, stamps } from "../db/schema";
import { ralliesForPlace, recordFinished } from "../rallies/rally-store";
import type { StampSpot, StampStore } from "./stamp-types";
import { withTravel, type Fix } from "./travel";

/** The waypoint a place is worshipped from (遥拝). */
const stampFrom = alias(spots, "stamp_from");

// Whether a place's stamp is pressed at the waypoint it points to (spots.stamp_spot_id): always for a place worshipped from
// afar (遥拝, 道とつながらない), and for any other place only while it is closed, e.g. a path lost to a landslide (2026-11-27,
// user). A place set to 情報のみ offers no stamp at all.
const usesStampFrom = sql`(${spots.stampSpotId} is not null and ${spots.status} <> 'info' and (${spots.detached} or ${spots.status} = 'closed'))`;

const spotColumns = {
  id: spots.id,
  routeId: spots.routeId,
  published: spots.published,
  stampable: spots.stampable,
  positionVerified: spots.positionVerified,
  // Where, how near and whether the stamp can be pressed all follow where it is pressed: the place itself, or its waypoint
  // (only while that one is published with a checked position, otherwise nowhere, so the place cannot be stamped). The
  // waypoint's range decides for every place stamped there (user, 2026-11-27).
  lat: sql<number | null>`case when not ${usesStampFrom} then ${spots.lat} when ${stampFrom.published} and ${stampFrom.positionVerified} then ${stampFrom.lat} end`.mapWith(Number),
  lng: sql<number | null>`case when not ${usesStampFrom} then ${spots.lng} when ${stampFrom.published} and ${stampFrom.positionVerified} then ${stampFrom.lng} end`.mapWith(Number),
  radiusM: sql<number>`case when ${usesStampFrom} then ${stampFrom.radiusM} else ${spots.radiusM} end`.mapWith(Number),
  status: sql<StampSpot["status"]>`case when ${usesStampFrom} then ${stampFrom.status} else ${spots.status} end`.mapWith(spots.status),
  statusUpdatedAt: sql<Date | null>`case when ${usesStampFrom} then ${stampFrom.statusUpdatedAt} else ${spots.statusUpdatedAt} end`.mapWith(spots.statusUpdatedAt),
  // Only while in use, so one press links exactly the places stamped at the same waypoint.
  stampSpotId: sql<string | null>`case when ${usesStampFrom} then ${spots.stampSpotId} end`,
};

const nameJa = alias(spotTranslations, "name_ja");
const nameEn = alias(spotTranslations, "name_en");

export function createDrizzleStampStore(db: Db): StampStore {
  return {
    async findSpot(id) {
      const [s] = await db.select(spotColumns).from(spots).leftJoin(stampFrom, eq(stampFrom.id, spots.stampSpotId)).where(eq(spots.id, id)).limit(1);
      return s ?? null;
    },

    async findSpots(ids) {
      return ids.length ? db.select(spotColumns).from(spots).leftJoin(stampFrom, eq(stampFrom.id, spots.stampSpotId)).where(inArray(spots.id, ids)) : [];
    },

    async linkedSpots(spot) {
      const hub = spot.stampSpotId ?? spot.id;
      const rows = await db
        .select({ ...spotColumns, nameJa: nameJa.name, nameEn: nameEn.name })
        .from(spots)
        .leftJoin(stampFrom, eq(stampFrom.id, spots.stampSpotId))
        .leftJoin(nameJa, and(eq(nameJa.spotId, spots.id), eq(nameJa.locale, "ja")))
        .leftJoin(nameEn, and(eq(nameEn.spotId, spots.id), eq(nameEn.locale, "en")))
        .where(and(or(eq(spots.id, hub), and(eq(spots.stampSpotId, hub), usesStampFrom)), ne(spots.id, spot.id)));
      return rows.map((r) => ({ ...r, nameJa: r.nameJa ?? "", nameEn: r.nameEn }));
    },

    async awardMany(userId, items) {
      if (items.length === 0) return { added: 0, already: 0 };
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`stamps.${userId}`}))`);
        const made = await tx
          .insert(stamps)
          .values(items.map((i) => ({ userId, spotId: i.spotId, createdAt: i.createdAt, flagged: i.flagged, flagReason: i.flagReason ?? (i.flagged ? "low_accuracy" : null) })))
          .onConflictDoNothing()
          .returning({ id: stamps.id });
        if (made.length) await recordFinished(tx, userId);
        return { added: made.length, already: items.length - made.length };
      });
    },

    async award(userId, spotId, flag) {
      return db.transaction(async (tx) => {
        // Two stamps by one visitor at once would each miss the other when working out a finish: serialise them per user.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`stamps.${userId}`}))`);
        // The visitor's latest stamp that still stands (revoked ones do not count), by the time it was pressed.
        const [last] = await tx
          .select({ lat: spots.lat, lng: spots.lng, at: sql<Date>`coalesce(${stamps.scannedAt}, ${stamps.createdAt})` })
          .from(stamps)
          .innerJoin(spots, eq(spots.id, stamps.spotId))
          .where(and(eq(stamps.userId, userId), isNull(stamps.revokedAt)))
          .orderBy(desc(sql`coalesce(${stamps.scannedAt}, ${stamps.createdAt})`))
          .limit(1);
        const prev: Fix | null = last && last.lat !== null && last.lng !== null ? { lat: last.lat, lng: last.lng, at: new Date(last.at) } : null;
        const { flagged, flagReason } = withTravel(flag, prev, flag.travel);
        // The unique index (user, place) decides a race between two taps: one row, the other sees it.
        const [made] = await tx
          .insert(stamps)
          .values({ userId, spotId, flagged, flagReason, scannedAt: flag.scannedAt ?? null })
          .onConflictDoNothing()
          .returning({ createdAt: stamps.createdAt, flagged: stamps.flagged });
        if (!made) {
          const [have] = await tx
            .select({ createdAt: stamps.createdAt, flagged: stamps.flagged, revokedAt: stamps.revokedAt })
            .from(stamps)
            .where(and(eq(stamps.userId, userId), eq(stamps.spotId, spotId)))
            .limit(1);
          return { created: false, createdAt: have!.createdAt, flagged: have!.flagged, revoked: have!.revokedAt !== null, finished: { routeIds: [], rallyIds: [] } };
        }
        return { created: true, createdAt: made.createdAt, flagged: made.flagged, revoked: false, finished: await recordFinished(tx, userId, { spotId }) };
      });
    },

    listMine(userId) {
      return db
        .select({ spotId: stamps.spotId, routeId: spots.routeId, createdAt: stamps.createdAt })
        .from(stamps)
        .innerJoin(spots, eq(spots.id, stamps.spotId))
        .where(and(eq(stamps.userId, userId), isNull(stamps.revokedAt)))
        .orderBy(desc(stamps.createdAt));
    },

    listCompletions(userId) {
      return db.select({ rallyId: rallyCompletions.rallyId, completedAt: rallyCompletions.completedAt }).from(rallyCompletions).where(eq(rallyCompletions.userId, userId));
    },

    async setRevoked(actor, id, revoked) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .update(stamps)
          .set(revoked ? { revokedAt: new Date(), revokedBy: actor } : { revokedAt: null, revokedBy: null })
          // Only a stamp in the other state changes, so a second click keeps the first admin and time.
          .where(and(eq(stamps.id, id), revoked ? isNull(stamps.revokedAt) : isNotNull(stamps.revokedAt)))
          .returning({ id: stamps.id, userId: stamps.userId, spotId: stamps.spotId });
        if (!row) {
          const [exists] = await tx.select({ id: stamps.id }).from(stamps).where(eq(stamps.id, id)).limit(1);
          return exists ? "ok" : "not_found";
        }
        if (revoked) {
          // A saved finish only ever grows, so a revoked stamp would leave "complete" standing: drop the finishes it was part of.
          const touched = await ralliesForPlace(tx, row.spotId);
          if (touched.routeIds.length) await tx.delete(courseCompletions).where(and(eq(courseCompletions.userId, row.userId), inArray(courseCompletions.routeId, touched.routeIds)));
          if (touched.rallyIds.length) await tx.delete(rallyCompletions).where(and(eq(rallyCompletions.userId, row.userId), inArray(rallyCompletions.rallyId, touched.rallyIds)));
        } else await recordFinished(tx, row.userId, { spotId: row.spotId }); // the finishes a revoke took away come back
        await writeAudit(tx, { actorUserId: actor, action: revoked ? "stamp.revoke" : "stamp.restore", targetId: id });
        return "ok";
      });
    },
  };
}
