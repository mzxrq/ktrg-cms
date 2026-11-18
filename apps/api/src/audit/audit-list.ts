import { and, eq, inArray } from "drizzle-orm";
import type { ReadDef } from "../admin-lists/list-routes";
import type { ListReader } from "../admin-lists/list-service";
import { afterCursor, newestFirst } from "../admin-lists/list-sql";
import type { ListReadStore, ListRow } from "../admin-lists/list-types";
import type { KitServices } from "../auth/route-kit";
import type { Db } from "../db/client";
import { auditLog, blogAuthors, blogPostTranslations, blogTags, furiganaWords, placeTranslations, rallyTranslations, routeTranslations, spots, spotTranslations, trailNoticeTranslations, users } from "../db/schema";
import { AUDIT_ACTION_OPTIONS } from "./audit-labels";

/**
 * One audit entry as the admin list shows it (an entry never changes, so updatedAt = createdAt). The entry itself holds ids
 * only; `actorName` is read from the account when the list is drawn (null once the account is gone or has no name), so no name
 * is ever written into the permanent log.
 */
export interface AuditListRow extends ListRow {
  action: string;
  targetType: string;
  targetId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  /** The item's name as it is now (read when shown, never stored in the log); null when it has none or is gone. */
  targetName: string | null;
}

type Named = { id: string; name: string | null };
/** How to read the current name of each kind of item (Japanese, the required language); a kind not here shows no name. */
const nameReaders = (db: Db): Record<string, (ids: string[]) => Promise<Named[]>> => {
  const ja = <T extends { locale: unknown }>(t: T) => eq(t.locale as never, "ja");
  return {
    route: (ids) => db.select({ id: routeTranslations.routeId, name: routeTranslations.name }).from(routeTranslations).where(and(inArray(routeTranslations.routeId, ids), ja(routeTranslations))),
    // A waypoint with its course ("where"): 展望台（友ヶ島と加太周辺）.
    spot: async (ids) =>
      (
        await db
          .select({ id: spotTranslations.spotId, name: spotTranslations.name, course: routeTranslations.name })
          .from(spotTranslations)
          .innerJoin(spots, eq(spots.id, spotTranslations.spotId))
          .leftJoin(routeTranslations, and(eq(routeTranslations.routeId, spots.routeId), ja(routeTranslations)))
          .where(and(inArray(spotTranslations.spotId, ids), ja(spotTranslations)))
      ).map((r) => ({ id: r.id, name: r.name && r.course ? `${r.name}（${r.course}）` : r.name })),
    rally: (ids) => db.select({ id: rallyTranslations.rallyId, name: rallyTranslations.name }).from(rallyTranslations).where(and(inArray(rallyTranslations.rallyId, ids), ja(rallyTranslations))),
    place: (ids) => db.select({ id: placeTranslations.placeId, name: placeTranslations.name }).from(placeTranslations).where(and(inArray(placeTranslations.placeId, ids), ja(placeTranslations))),
    notice: (ids) => db.select({ id: trailNoticeTranslations.trailNoticeId, name: trailNoticeTranslations.title }).from(trailNoticeTranslations).where(and(inArray(trailNoticeTranslations.trailNoticeId, ids), ja(trailNoticeTranslations))),
    post: (ids) => db.select({ id: blogPostTranslations.blogPostId, name: blogPostTranslations.title }).from(blogPostTranslations).where(and(inArray(blogPostTranslations.blogPostId, ids), ja(blogPostTranslations))),
    author: (ids) => db.select({ id: blogAuthors.id, name: blogAuthors.nameJa }).from(blogAuthors).where(inArray(blogAuthors.id, ids)),
    tag: (ids) => db.select({ id: blogTags.id, name: blogTags.nameJa }).from(blogTags).where(inArray(blogTags.id, ids)),
    furigana: (ids) => db.select({ id: furiganaWords.id, name: furiganaWords.word }).from(furiganaWords).where(inArray(furiganaWords.id, ids)),
    user: (ids) => db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, ids)),
  };
};

/** The current names of a page's items: one query per kind of item on the page, one after another (the pool rule). */
async function targetNames(db: Db, rows: { targetType: string; targetId: string | null }[]): Promise<Map<string, string>> {
  const readers = nameReaders(db);
  const byType = new Map<string, Set<string>>();
  for (const r of rows) if (r.targetId && readers[r.targetType]) byType.set(r.targetType, (byType.get(r.targetType) ?? new Set()).add(r.targetId));
  const names = new Map<string, string>();
  for (const [type, ids] of byType) for (const n of await readers[type]!([...ids])) if (n.name) names.set(`${type}:${n.id}`, n.name);
  return names;
}

export function createDrizzleAuditListStore(db: Db): ListReadStore<AuditListRow> {
  const out = (r: typeof auditLog.$inferSelect, actorName: string | null, names: Map<string, string>): AuditListRow => ({ ...r, actorName, targetName: (r.targetId && names.get(`${r.targetType}:${r.targetId}`)) || null, updatedAt: r.createdAt });
  return {
    async list(cursor, limit) {
      const rows = await db
        .select({ entry: auditLog, actorName: users.displayName })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.actorUserId))
        .where(afterCursor(auditLog.createdAt, auditLog.id, cursor))
        .orderBy(...newestFirst(auditLog.createdAt, auditLog.id))
        .limit(limit);
      const names = await targetNames(db, rows.map((r) => r.entry));
      return rows.map((r) => out(r.entry, r.actorName, names));
    },
    async get(id) {
      const [row] = await db
        .select({ entry: auditLog, actorName: users.displayName })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.actorUserId))
        .where(eq(auditLog.id, id))
        .limit(1);
      return row ? out(row.entry, row.actorName, await targetNames(db, [row.entry])) : null;
    },
  };
}

export interface AuditListServices extends KitServices {
  auditList: ListReader<AuditListRow>;
}

const text = (name: string, ja: string, en: string, inList?: { ja: string; en: string }) => ({
  name,
  kind: "text" as const,
  label: { ja, en },
  readOnly: true,
  ...(inList ? { inList: { text: inList, empty: { ja: "なし", en: "none" } } } : {}),
});

/** The audit log as an admin list (`audit.read`): read only, newest first. Who did what to which id, and when. */
export const auditLogList: ReadDef<"audit", AuditListRow, AuditListServices> = {
  key: "audit",
  permission: "audit.read",
  service: (s) => s.auditList,
  ops: { create: false, edit: false, delete: false },
  ui: {
    title: { ja: "変更の記録", en: "Change log" },
    intro: {
      ja: "管理画面での変更や、ログインに関わる大切な操作の記録です。誰が・何を・どれに・いつ、をIDで残します。人やものの名前は記録に書かず、表示するときに今の名前を読みます（消したものは名前が出ません）。管理者・編集者のログイン／ログアウトも残ります。新しいものが上です。",
      en: "A record of changes made in the admin and of important sign-in actions: who did what to which item, and when, by ID. Names of people and items are not written into the log; their current names are read when shown (nothing is shown for something deleted). Admin and editor logins and logouts are recorded too. Newest first.",
    },
    titleField: "action",
    // Read as a sentence: what was done (in words), to which item (its name now), by whom, when (to the second).
    fields: [
      { name: "action", kind: "select", label: { ja: "したこと", en: "What" }, readOnly: true, options: AUDIT_ACTION_OPTIONS },
      text("targetName", "対象", "Item", { ja: "「{value}」", en: "“{value}”" }),
      text("actorName", "した人", "Done by", { ja: "{value}", en: "{value}" }),
      { name: "createdAt", kind: "datetime", label: { ja: "日時", en: "When" }, readOnly: true, inList: {}, seconds: true },
      text("targetType", "対象の種類", "Kind of item"),
      text("targetId", "対象のID", "Item ID"),
      text("actorUserId", "した人のID", "Done by (account ID)"),
    ],
  },
};
