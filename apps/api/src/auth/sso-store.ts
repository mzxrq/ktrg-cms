import { and, count, eq, isNull, sql } from "drizzle-orm";
import { writeAudit } from "../audit/audit-store";
import type { Db } from "../db/client";
import { passkeys, userIdentities, users } from "../db/schema";
import type { SsoStore } from "./sso-service";

const authUser = { id: users.id, email: users.email, role: users.role, locale: users.locale };

export function createDrizzleSsoStore(db: Db): SsoStore {
  return {
    async findUser(provider, subject) {
      const [row] = await db
        .select(authUser)
        .from(userIdentities)
        .innerJoin(users, eq(users.id, userIdentities.userId))
        .where(and(eq(userIdentities.provider, provider), eq(userIdentities.subject, subject)))
        .limit(1);
      return row ?? null;
    },

    async createUser({ provider, subject, email, displayName, locale }) {
      try {
        return await db.transaction(async (tx) => {
          if (email) {
            const [owner] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
            if (owner) return "email_in_use" as const;
          }
          const [user] = await tx.insert(users).values({ email, displayName, locale }).returning(authUser);
          await tx.insert(userIdentities).values({ userId: user!.id, provider, subject });
          return user!;
        });
      } catch (err) {
        // Two first visits at once: the other one won the email or the identity. The transaction rolled back.
        if ((err as { code?: string; cause?: { code?: string } }).code === "23505" || (err as { cause?: { code?: string } }).cause?.code === "23505") return "taken";
        throw err;
      }
    },

    async fillName(userId, name) {
      await db.update(users).set({ displayName: name }).where(and(eq(users.id, userId), isNull(users.displayName)));
    },

    async link(userId, provider, subject) {
      return db.transaction(async (tx) => {
        const [mine] = await tx
          .insert(userIdentities)
          .values({ userId, provider, subject })
          .onConflictDoNothing()
          .returning({ id: userIdentities.id });
        if (!mine) {
          const [row] = await tx
            .select({ userId: userIdentities.userId })
            .from(userIdentities)
            .where(and(eq(userIdentities.provider, provider), eq(userIdentities.subject, subject)))
            .limit(1);
          return row?.userId === userId ? "ok" : "taken";
        }
        await writeAudit(tx, { actorUserId: userId, action: "sso.link", targetId: userId });
        return "ok";
      });
    },

    async list(userId) {
      return db
        .select({ id: userIdentities.id, provider: userIdentities.provider, createdAt: userIdentities.createdAt })
        .from(userIdentities)
        .where(eq(userIdentities.userId, userId))
        .orderBy(userIdentities.createdAt);
    },

    async unlink(userId, identityId) {
      return db.transaction(async (tx) => {
        // Lock the account row so two removals at once cannot both pass the "last way in" check.
        const [user] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId)).for("update");
        const [row] = await tx
          .select({ id: userIdentities.id })
          .from(userIdentities)
          .where(and(eq(userIdentities.id, identityId), eq(userIdentities.userId, userId)));
        if (!user || !row) return "not_found";
        if (!user.email) {
          const keys = (await tx.select({ n: count() }).from(passkeys).where(eq(passkeys.userId, userId)))[0]?.n ?? 0;
          const links = (await tx.select({ n: count() }).from(userIdentities).where(eq(userIdentities.userId, userId)))[0]?.n ?? 0;
          if (keys === 0 && links <= 1) return "last";
        }
        await tx.delete(userIdentities).where(eq(userIdentities.id, identityId));
        await writeAudit(tx, { actorUserId: userId, action: "sso.unlink", targetId: userId });
        return "ok";
      });
    },
  };
}
