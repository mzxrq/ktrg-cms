import { randomUUID } from "node:crypto";
import type { SsoIdentity, SsoStore } from "./sso-service";
import type { SsoProvider } from "./sso";
import type { AuthUser } from "./user";

/**
 * In-memory store for tests and manual checks. `users` is the map the OTP memory store fills (keyed by email, or by id when
 * there is none); `passkeyUsers` stands in for the passkeys table in the "last way in" check.
 */
export function createMemorySsoStore(users: Map<string, AuthUser>, passkeyUsers: Set<string> = new Set()) {
  const rows: (SsoIdentity & { userId: string; subject: string })[] = [];
  /** Stands in for the audit log. */
  const actions: string[] = [];
  /** Stands in for users.display_name. */
  const names = new Map<string, string>();
  const byId = (id: string) => [...users.values()].find((u) => u.id === id) ?? null;
  const find = (provider: SsoProvider, subject: string) => rows.find((r) => r.provider === provider && r.subject === subject);

  const store: SsoStore = {
    async findUser(provider, subject) {
      const row = find(provider, subject);
      return row ? byId(row.userId) : null;
    },
    async createUser({ provider, subject, email, displayName, locale }) {
      if (email && [...users.values()].some((u) => u.email === email)) return "email_in_use";
      if (find(provider, subject)) return "taken";
      const user: AuthUser = { id: randomUUID(), email, role: "participant", locale };
      users.set(email ?? user.id, user);
      if (displayName) names.set(user.id, displayName);
      rows.push({ id: randomUUID(), userId: user.id, provider, subject, createdAt: new Date() });
      return user;
    },
    async fillName(userId, name) {
      if (!names.has(userId)) names.set(userId, name);
    },
    async link(userId, provider, subject) {
      const row = find(provider, subject);
      if (row) return row.userId === userId ? "ok" : "taken";
      rows.push({ id: randomUUID(), userId, provider, subject, createdAt: new Date() });
      actions.push("sso.link");
      return "ok";
    },
    async list(userId) {
      return rows.filter((r) => r.userId === userId).map(({ id, provider, createdAt }) => ({ id, provider, createdAt }));
    },
    async unlink(userId, identityId) {
      const i = rows.findIndex((r) => r.id === identityId && r.userId === userId);
      if (i === -1) return "not_found";
      const others = rows.filter((r) => r.userId === userId).length - 1;
      if (!byId(userId)?.email && !passkeyUsers.has(userId) && others === 0) return "last";
      rows.splice(i, 1);
      actions.push("sso.unlink");
      return "ok";
    },
  };
  return { store, rows, actions, names };
}
