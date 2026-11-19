import type { IdClaims, SsoProvider } from "./sso";
import type { AuthUser, Locale } from "./user";

/** A Google, LINE or Apple account signed in to ours, as the settings screen lists it. */
export interface SsoIdentity {
  id: string;
  provider: SsoProvider;
  createdAt: Date;
}

/** Storage for linked accounts; the Drizzle version is in sso-store.ts. Link and unlink write their audit rows themselves. */
export interface SsoStore {
  /** The account this provider account signs in to. */
  findUser(provider: SsoProvider, subject: string): Promise<AuthUser | null>;
  /**
   * A new participant signed in by this provider account, with the email if any. "email_in_use": the address is already
   * another account's (never merged quietly: that would hand the account to whoever controls the provider account).
   * "taken": the provider account was linked meanwhile.
   */
  createUser(input: { provider: SsoProvider; subject: string; email: string | null; locale: Locale }): Promise<AuthUser | "email_in_use" | "taken">;
  /** "taken": the provider account already signs in to another account. Linking it again to the same one is fine. */
  link(userId: string, provider: SsoProvider, subject: string): Promise<"ok" | "taken">;
  list(userId: string): Promise<SsoIdentity[]>;
  /** "last": it is the only way in (no email, no passkey, nothing else linked), so removing it would lock the owner out. */
  unlink(userId: string, identityId: string): Promise<"ok" | "not_found" | "last">;
}

export type SsoLoginResult = { ok: true; user: AuthUser; created: boolean } | { ok: false; error: "sso_staff" | "sso_email_in_use" | "sso_failed" };

/**
 * `adminEmails` (ADMIN_EMAILS): such an address is never taken from a provider. An email-code login with it later would
 * promote the account the provider made, and the provider's session on it would become an admin session.
 */
export function createSsoService({ store, adminEmails = new Set() }: { store: SsoStore; adminEmails?: ReadonlySet<string> }) {
  return {
    /** Sign in, or make the account on the first visit. Editors and admins never sign in this way (like the password). */
    async login(provider: SsoProvider, claims: IdClaims, locale: Locale): Promise<SsoLoginResult> {
      const found = await store.findUser(provider, claims.subject);
      if (found) return found.role === "participant" ? { ok: true, user: found, created: false } : { ok: false, error: "sso_staff" };
      const email = claims.email && !adminEmails.has(claims.email) ? claims.email : null;
      const made = await store.createUser({ provider, subject: claims.subject, email, locale });
      if (made === "email_in_use") return { ok: false, error: "sso_email_in_use" };
      if (made === "taken") return { ok: false, error: "sso_failed" };
      return { ok: true, user: made, created: true };
    },

    /** Is this provider account linked to this user? (The re-check proves the same person came back.) */
    async owns(userId: string, provider: SsoProvider, subject: string) {
      return (await store.findUser(provider, subject))?.id === userId;
    },

    link: store.link,
    list: store.list,
    unlink: store.unlink,
  };
}

export type SsoService = ReturnType<typeof createSsoService>;
