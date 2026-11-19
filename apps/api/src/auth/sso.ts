import { createHash, randomBytes } from "node:crypto";
import { normalizeEmail } from "./otp";
import type { Locale } from "./user";

/**
 * Sign in with Google, LINE or Apple (OpenID Connect, authorization code flow). No library: the ID token comes straight from
 * the provider's token endpoint over TLS, which OIDC Core 3.1.3.7 (6) accepts in place of checking its signature; its
 * issuer, audience, expiry and nonce are still checked here.
 */
export const SSO_PROVIDERS = ["google", "line", "apple"] as const;
export type SsoProvider = (typeof SSO_PROVIDERS)[number];

/** login: sign in or make an account. link: add the provider to the signed-in account. reauth: the fresh-login re-check. */
export type SsoMode = "login" | "link" | "reauth";

export interface ProviderSettings {
  clientId: string;
  /** Google and LINE. Apple has none: its secret is a short JWT signed with `apple`. */
  clientSecret?: string;
  apple?: { teamId: string; keyId: string; privateKey: string };
}

export interface SsoConfig {
  /** The site's address; the callbacks live under it (the web app passes /api to the API). */
  appOrigin: string;
  /** Only the providers set up in the environment. */
  providers: Partial<Record<SsoProvider, ProviderSettings>>;
  /** Tests pass a fake provider. */
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => Date;
}

const PROVIDERS: Record<SsoProvider, { authorize: string; token: string; issuers: string[]; scope: string; pkce: boolean }> = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    issuers: ["https://accounts.google.com", "accounts.google.com"],
    scope: "openid email",
    pkce: true,
  },
  // The email arrives only once the channel has LINE's email permission; until then accounts are made without one.
  line: {
    authorize: "https://access.line.me/oauth2/v2.1/authorize",
    token: "https://api.line.me/oauth2/v2.1/token",
    issuers: ["https://access.line.me"],
    scope: "openid email",
    pkce: true,
  },
  // Asking for the email makes Apple POST the answer back (form_post): see the apple callback route. Apple does not document PKCE.
  apple: {
    authorize: "https://appleid.apple.com/auth/authorize",
    token: "https://appleid.apple.com/auth/token",
    issuers: ["https://appleid.apple.com"],
    scope: "email",
    pkce: false,
  },
};

/** How long the trip to the provider and back may take. */
export const SSO_FLOW_MS = 10 * 60 * 1000;

/** What the browser keeps (an HttpOnly cookie) between leaving for the provider and coming back. */
export interface SsoFlow {
  provider: SsoProvider;
  mode: SsoMode;
  state: string;
  nonce: string;
  verifier: string;
  locale: Locale;
  /** A path on this site to go back to. */
  returnTo: string;
  /** link and reauth: the account that started it; the callback must come back to the same one. */
  userId?: string;
}

export const ssoCookieName = (secure: boolean) => (secure ? "__Host-ktrg_sso" : "ktrg_sso");

export const encodeFlow = (flow: SsoFlow) => Buffer.from(JSON.stringify(flow)).toString("base64url");

export function decodeFlow(raw: string): SsoFlow | null {
  try {
    const f = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<SsoFlow>;
    const ok =
      SSO_PROVIDERS.includes(f.provider as SsoProvider) &&
      ["login", "link", "reauth"].includes(f.mode as string) &&
      [f.state, f.nonce, f.verifier, f.returnTo].every((v) => typeof v === "string" && v.length > 0) &&
      (f.locale === "ja" || f.locale === "en") &&
      (f.userId === undefined || typeof f.userId === "string");
    return ok ? (f as SsoFlow) : null;
  } catch {
    return null;
  }
}

/** A path on this site, never another site ("//evil.example", "/\evil.example"). Anything else goes home. */
export function safeReturnTo(path: string | undefined): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\") || path.length > 300) return "/";
  return path;
}

/** The path with one query value added (`sso_error=...`, `sso=linked`). */
export function withQuery(path: string, key: string, value: string): string {
  const url = new URL(path, "http://x");
  url.searchParams.set(key, value);
  return url.pathname + url.search + url.hash;
}

const random = () => randomBytes(32).toString("base64url");

export interface IdClaims {
  subject: string;
  /** Kept only to reach the person for recovery (login codes, alerts). Null when the provider gave none or did not verify it. */
  email: string | null;
}

/** Reads the ID token from the token endpoint; null unless it is for us, from this provider, unexpired and for this flow. */
export function readIdToken(idToken: string, provider: SsoProvider, clientId: string, nonce: string, now: Date): IdClaims | null {
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (typeof c.iss !== "string" || !PROVIDERS[provider].issuers.includes(c.iss)) return null;
  if (!aud.includes(clientId)) return null;
  if (typeof c.exp !== "number" || c.exp * 1000 <= now.getTime()) return null;
  if (c.nonce !== nonce) return null;
  if (typeof c.sub !== "string" || c.sub.length === 0 || c.sub.length > 255) return null;
  // Google and Apple say whether they checked the address (Apple as a string). LINE's id token has no such claim; the team
  // accepts LINE's address (2026-11-19).
  const verified = provider === "line" || c.email_verified === true || c.email_verified === "true";
  const email = typeof c.email === "string" && verified && /^[^\s@]+@[^\s@]+$/.test(c.email) && c.email.length <= 254 ? normalizeEmail(c.email) : null;
  return { subject: c.sub, email };
}

/** Apple's client secret: an ES256 JWT signed with the key from the Apple developer account, good for five minutes. */
export async function appleClientSecret(clientId: string, apple: NonNullable<ProviderSettings["apple"]>, now: Date): Promise<string> {
  const pem = apple.privateKey.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Buffer.from(pem, "base64"), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const iat = Math.floor(now.getTime() / 1000);
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const body = `${part({ alg: "ES256", kid: apple.keyId })}.${part({ iss: apple.teamId, iat, exp: iat + 300, aud: "https://appleid.apple.com", sub: clientId })}`;
  // WebCrypto signs ECDSA as r||s, which is exactly what a JWS wants.
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, Buffer.from(body));
  return `${body}.${Buffer.from(sig).toString("base64url")}`;
}

export function createSso(config: SsoConfig) {
  const now = config.now ?? (() => new Date());
  const doFetch = config.fetch ?? ((url: string, init: RequestInit) => fetch(url, init));
  const redirectUri = (p: SsoProvider) => `${config.appOrigin}/api/v1/auth/sso/${p}/callback`;

  return {
    /** The providers this site has set up, for the buttons. */
    providers: (): SsoProvider[] => SSO_PROVIDERS.filter((p) => config.providers[p]),

    enabled: (p: SsoProvider) => config.providers[p] !== undefined,

    newFlow: (provider: SsoProvider, mode: SsoMode, opts: { locale: Locale; returnTo?: string; userId?: string }): SsoFlow => ({
      provider,
      mode,
      state: random(),
      nonce: random(),
      verifier: random(),
      locale: opts.locale,
      returnTo: safeReturnTo(opts.returnTo),
      ...(opts.userId ? { userId: opts.userId } : {}),
    }),

    /** Where to send the browser. */
    authorizeUrl(flow: SsoFlow): string {
      const def = PROVIDERS[flow.provider];
      const url = new URL(def.authorize);
      const q = url.searchParams;
      q.set("client_id", config.providers[flow.provider]!.clientId);
      q.set("redirect_uri", redirectUri(flow.provider));
      q.set("response_type", "code");
      q.set("scope", def.scope);
      q.set("state", flow.state);
      q.set("nonce", flow.nonce);
      if (def.pkce) {
        q.set("code_challenge", createHash("sha256").update(flow.verifier).digest("base64url"));
        q.set("code_challenge_method", "S256");
      }
      if (flow.provider === "apple") q.set("response_mode", "form_post");
      // Make Google show its account chooser, so a shared phone does not silently sign in as the last person.
      if (flow.provider === "google") q.set("prompt", "select_account");
      return url.toString();
    },

    /** Trade the code for the ID token and read it; null on any problem (the reason is not logged: it may hold the code). */
    async finish(flow: SsoFlow, code: string): Promise<IdClaims | null> {
      const settings = config.providers[flow.provider];
      if (!settings) return null;
      const def = PROVIDERS[flow.provider];
      const at = now();
      const secret = settings.apple ? await appleClientSecret(settings.clientId, settings.apple, at) : settings.clientSecret;
      const form = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(flow.provider), client_id: settings.clientId });
      if (secret) form.set("client_secret", secret);
      if (def.pkce) form.set("code_verifier", flow.verifier);
      try {
        const res = await doFetch(def.token, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
          body: form.toString(),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          console.error(`[sso] ${flow.provider} token endpoint answered ${res.status}`);
          return null;
        }
        const body = (await res.json()) as { id_token?: unknown };
        if (typeof body.id_token !== "string") return null;
        return readIdToken(body.id_token, flow.provider, settings.clientId, flow.nonce, at);
      } catch {
        console.error(`[sso] ${flow.provider} token endpoint did not answer`);
        return null;
      }
    },
  };
}

export type Sso = ReturnType<typeof createSso>;

const SSO_ENV = {
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  line: ["LINE_CHANNEL_ID", "LINE_CHANNEL_SECRET"],
  apple: ["APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY"],
} as const;

/** The providers whose settings are all there. One set only in part is left off, and its name (never a value) is logged. */
export function ssoProvidersFromEnv(env: Partial<Record<(typeof SSO_ENV)[SsoProvider][number], string>>, log: (line: string) => void = console.error) {
  const out: SsoConfig["providers"] = {};
  for (const p of SSO_PROVIDERS) {
    const missing = SSO_ENV[p].filter((k) => !env[k]);
    if (missing.length === SSO_ENV[p].length) continue;
    if (missing.length > 0) {
      log(`[env] sign-in with ${p} is OFF: missing ${missing.join(", ")}`);
      continue;
    }
    if (p === "google") out.google = { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! };
    if (p === "line") out.line = { clientId: env.LINE_CHANNEL_ID!, clientSecret: env.LINE_CHANNEL_SECRET! };
    if (p === "apple") out.apple = { clientId: env.APPLE_CLIENT_ID!, apple: { teamId: env.APPLE_TEAM_ID!, keyId: env.APPLE_KEY_ID!, privateKey: env.APPLE_PRIVATE_KEY! } };
  }
  return out;
}
