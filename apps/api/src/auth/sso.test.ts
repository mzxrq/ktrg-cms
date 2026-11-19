import { describe, expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { Elysia } from "elysia";
import { createMemoryAuditWriter } from "../audit/audit-log";
import { apiBase } from "../lib/api-errors";
import { createRateLimiter } from "./rate-limit";
import { createMemoryRateLimitStore } from "./rate-limit-memory-store";
import { createMemorySessionStore } from "./session-memory-store";
import { createSessionService } from "./session-service";
import { appleClientSecret, createSso, decodeFlow, readIdToken, safeReturnTo, ssoProvidersFromEnv, type SsoProvider } from "./sso";
import { createMemorySsoStore } from "./sso-memory-store";
import { ssoRoutes } from "./sso-routes";
import { createSsoService } from "./sso-service";
import type { AuthUser } from "./user";

const ORIGIN = "https://example.com";
const alice: AuthUser = { id: "11111111-1111-1111-1111-111111111111", email: "alice@example.com", role: "participant", locale: "en" };
const bob: AuthUser = { id: "22222222-2222-2222-2222-222222222222", email: null, role: "participant", locale: "ja" };
const editor: AuthUser = { id: "33333333-3333-3333-3333-333333333333", email: "editor@example.com", role: "editor", locale: "ja" };
const ISS: Record<SsoProvider, string> = { google: "https://accounts.google.com", line: "https://access.line.me", apple: "https://appleid.apple.com" };

/** An unsigned ID token: the routes trust the token endpoint's TLS, so the fake endpoint's word is what is tested. */
const idToken = (claims: Record<string, unknown>) =>
  `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

function setup() {
  const users = new Map<string, AuthUser>([alice, bob, editor].map((u) => [u.id, u]));
  let at = new Date("2026-11-19T00:00:00Z");
  const now = () => at;
  const session = createSessionService({ store: createMemorySessionStore(users).store, now });
  const mem = createMemorySsoStore(users);
  const audit = createMemoryAuditWriter();
  const rateLimit = createRateLimiter({ store: createMemoryRateLimitStore().store, secret: "s".repeat(32), now });
  /** What the fake provider says next; the nonce is filled in from the flow, as a real provider echoes it. */
  let answer: Record<string, unknown> = {};
  let nonce = "";
  const tokenCalls: URLSearchParams[] = [];
  const ssoProviders = createSso({
    appOrigin: ORIGIN,
    now,
    providers: { google: { clientId: "g-id", clientSecret: "g-secret" }, line: { clientId: "l-id", clientSecret: "l-secret" } },
    fetch: async (_url, init) => {
      tokenCalls.push(new URLSearchParams(String(init.body)));
      return Response.json({ id_token: idToken({ nonce, exp: at.getTime() / 1000 + 600, ...answer }) });
    },
  });
  const services = { sso: createSsoService({ store: mem.store, adminEmails: new Set(["boss@example.com"]) }), ssoProviders, session, rateLimit, audit: audit.writer };
  const app = new Elysia({ prefix: "/api/v1" })
    .use(apiBase({ allowedOrigin: () => ORIGIN, log: () => {} }))
    .use(ssoRoutes(() => services, { secureCookies: false, appOrigin: () => ORIGIN }));

  const call = (method: string, path: string, opts: { body?: unknown; cookie?: string; origin?: string; form?: string } = {}) =>
    app.handle(
      new Request(`http://localhost/api/v1/auth/sso${path}`, {
        method,
        headers: {
          ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
          ...(opts.form !== undefined ? { "content-type": "application/x-www-form-urlencoded" } : {}),
          ...(opts.cookie ? { cookie: opts.cookie } : {}),
          ...(opts.origin ? { origin: opts.origin } : {}),
        },
        body: opts.form ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
      }),
    );
  const cookieFor = async (user: AuthUser, fresh = true) => `session=${(await session.create(user, { fresh })).token}`;
  const cookieValue = (res: Response, name: string) =>
    res.headers.getSetCookie().map((c) => c.split(";")[0]!).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;

  /** Start a flow, let the fake provider answer with these claims, and come back. Returns the callback's answer. */
  async function roundTrip(provider: SsoProvider, mode: "login" | "link" | "reauth", claims: Record<string, unknown>, o: { cookie?: string; returnTo?: string; state?: string } = {}) {
    const start = await call("POST", `/${provider}/${mode}`, { body: { returnTo: o.returnTo }, cookie: o.cookie });
    expect(start.status).toBe(200);
    const flowRaw = cookieValue(start, "ktrg_sso")!;
    const flow = decodeFlow(flowRaw)!;
    nonce = flow.nonce;
    answer = { iss: ISS[provider], aud: provider === "google" ? "g-id" : "l-id", ...claims };
    const cookie = [o.cookie, `ktrg_sso=${flowRaw}`].filter(Boolean).join("; ");
    return call("GET", `/${provider}/callback?code=the-code&state=${o.state ?? flow.state}`, { cookie });
  }
  const passTime = (ms: number) => (at = new Date(at.getTime() + ms));
  return { call, cookieFor, cookieValue, roundTrip, users, mem, tokenCalls, passTime, audit, setNonce: (n: string) => (nonce = n) };
}

describe("reading the ID token", () => {
  const now = new Date("2026-11-19T00:00:00Z");
  const base = { iss: "https://accounts.google.com", aud: "g-id", exp: now.getTime() / 1000 + 60, nonce: "n", sub: "123" };
  const read = (claims: Record<string, unknown>, provider: SsoProvider = "google") => readIdToken(idToken(claims), provider, "g-id", "n", now);

  test("a good token gives the provider's id for the person", () => {
    expect(read(base)).toEqual({ subject: "123", email: null });
  });
  test("another site's, another provider's, an expired or another flow's token is refused", () => {
    expect(read({ ...base, aud: "someone-else" })).toBeNull();
    expect(read({ ...base, iss: "https://evil.example" })).toBeNull();
    expect(read(base, "line")).toBeNull();
    expect(read({ ...base, exp: now.getTime() / 1000 - 1 })).toBeNull();
    expect(read({ ...base, nonce: "other" })).toBeNull();
    expect(read({ ...base, sub: "" })).toBeNull();
    expect(readIdToken("not-a-token", "google", "g-id", "n", now)).toBeNull();
  });
  test("the email is kept only when the provider checked it (LINE: always, as the team decided)", () => {
    expect(read({ ...base, email: "A@Example.com", email_verified: true })?.email).toBe("a@example.com");
    expect(read({ ...base, email: "a@example.com", email_verified: false })?.email).toBeNull();
    expect(read({ ...base, email: "a@example.com", email_verified: "true", iss: "https://appleid.apple.com" }, "apple")?.email).toBe("a@example.com");
    expect(read({ ...base, email: "a@example.com", iss: "https://access.line.me" }, "line")?.email).toBe("a@example.com");
  });
});

describe("small pieces", () => {
  test("only a path on this site is a place to come back to", () => {
    expect(safeReturnTo("/settings?x=1")).toBe("/settings?x=1");
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", undefined, ""]) expect(safeReturnTo(bad)).toBe("/");
  });

  test("a provider with only some settings stays off and is named in the log (never the values)", () => {
    const lines: string[] = [];
    const out = ssoProvidersFromEnv({ GOOGLE_CLIENT_ID: "id", LINE_CHANNEL_ID: "x", LINE_CHANNEL_SECRET: "y" }, (l) => lines.push(l));
    expect(Object.keys(out)).toEqual(["line"]);
    expect(lines.join()).toContain("GOOGLE_CLIENT_SECRET");
    expect(lines.join()).not.toContain("id");
  });

  test("Apple's client secret is an ES256 JWT its key verifies", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const now = new Date("2026-11-19T00:00:00Z");
    const jwt = await appleClientSecret("com.example.web", { teamId: "TEAM", keyId: "KEY", privateKey: pem.replace(/\n/g, "\\n") }, now);
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY" });
    expect(JSON.parse(Buffer.from(p!, "base64url").toString())).toMatchObject({ iss: "TEAM", sub: "com.example.web", aud: "https://appleid.apple.com" });
    const key = await crypto.subtle.importKey("spki", publicKey.export({ type: "spki", format: "der" }), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, Buffer.from(s!, "base64url"), Buffer.from(`${h}.${p}`))).toBe(true);
  });
});

describe("signing in", () => {
  test("the start gives the provider's address with state, nonce and PKCE, and keeps them in an HttpOnly cookie", async () => {
    const { call } = setup();
    const res = await call("POST", "/google/login", { body: {} });
    const { url } = (await res.json()) as { url: string };
    const q = new URL(url).searchParams;
    expect(url.startsWith("https://accounts.google.com/")).toBe(true);
    expect(q.get("redirect_uri")).toBe(`${ORIGIN}/api/v1/auth/sso/google/callback`);
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("state")).toBeTruthy();
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
  });

  test("a provider the site has not set up answers 404", async () => {
    const { call } = setup();
    expect((await call("POST", "/apple/login", { body: {} })).status).toBe(404);
    expect(await (await call("GET", "/providers")).json()).toEqual({ ok: true, providers: ["google", "line"] });
  });

  test("the first visit makes a participant with LINE's email; the next one signs in to the same account", async () => {
    const { roundTrip, cookieValue, users, tokenCalls } = setup();
    const first = await roundTrip("line", "login", { sub: "U1", email: "hanako@example.com" }, { returnTo: "/stamps" });
    expect(first.status).toBe(302);
    // A new account meets the set-up screen first, like any sign-up.
    expect(first.headers.get("location")).toBe(`${ORIGIN}/welcome?next=%2Fstamps`);
    expect(cookieValue(first, "session")).toBeTruthy();
    expect(cookieValue(first, "ktrg_sso")).toBe(""); // the flow cookie is cleared
    expect(tokenCalls[0]!.get("code_verifier")).toBeTruthy();
    const made = [...users.values()].find((u) => u.email === "hanako@example.com")!;
    expect(made.role).toBe("participant");
    const again = await roundTrip("line", "login", { sub: "U1" }, { returnTo: "/stamps" });
    expect(again.headers.get("location")).toBe(`${ORIGIN}/stamps`);
    expect(cookieValue(again, "session")).toBeTruthy();
    expect([...users.values()].filter((u) => u.email === "hanako@example.com")).toHaveLength(1);
  });

  test("an answer that is not for this browser's flow signs nobody in", async () => {
    const { roundTrip, cookieValue, call } = setup();
    const res = await roundTrip("google", "login", { sub: "G1" }, { state: "forged" });
    expect(res.headers.get("location")).toBe(`${ORIGIN}/login?sso_error=sso_failed`);
    expect(cookieValue(res, "session")).toBeNull();
    // No flow cookie at all (another browser).
    const bare = await call("GET", "/google/callback?code=c&state=s");
    expect(bare.headers.get("location")).toBe(`${ORIGIN}/login?sso_error=sso_failed`);
  });

  test("a token for another flow (wrong nonce) is refused", async () => {
    const { roundTrip, cookieValue } = setup();
    const res = await roundTrip("google", "login", { sub: "G1", nonce: "someone-elses" });
    expect(res.headers.get("location")).toContain("sso_error=sso_failed");
    expect(cookieValue(res, "session")).toBeNull();
  });

  test("an email that is already an account's is never merged quietly", async () => {
    const { roundTrip } = setup();
    const res = await roundTrip("google", "login", { sub: "G1", email: "alice@example.com", email_verified: true });
    expect(res.headers.get("location")).toContain("sso_error=sso_email_in_use");
  });

  test("an ADMIN_EMAILS address is never taken from a provider (an email-code login would promote the account)", async () => {
    const { roundTrip, users } = setup();
    const res = await roundTrip("google", "login", { sub: "G-BOSS", email: "boss@example.com", email_verified: true });
    expect(res.status).toBe(302);
    expect([...users.values()].some((u) => u.email === "boss@example.com")).toBe(false);
  });

  test("cancelling at the provider comes back with a calm message", async () => {
    const { call, cookieValue } = setup();
    const start = await call("POST", "/google/login", { body: {} });
    const raw = cookieValue(start, "ktrg_sso")!;
    const res = await call("GET", `/google/callback?error=access_denied&state=${decodeFlow(raw)!.state}`, { cookie: `ktrg_sso=${raw}` });
    expect(res.headers.get("location")).toContain("sso_error=sso_cancelled");
  });

  test("editors and admins cannot sign in this way, even with a linked account", async () => {
    const { roundTrip, mem } = setup();
    await mem.store.link(editor.id, "google", "G-ED");
    const res = await roundTrip("google", "login", { sub: "G-ED" });
    expect(res.headers.get("location")).toContain("sso_error=sso_staff");
  });
});

describe("linking to the signed-in account", () => {
  test("needs a fresh login, and staff cannot link at all", async () => {
    const { call, cookieFor } = setup();
    const stale = await call("POST", "/google/link", { body: {}, cookie: await cookieFor(alice, false) });
    expect(stale.status).toBe(403);
    expect(await stale.json()).toMatchObject({ error: "reauth_required" });
    expect((await call("POST", "/google/link", { body: {}, cookie: await cookieFor(editor) })).status).toBe(403);
    expect((await call("POST", "/google/link", { body: {} })).status).toBe(401);
  });

  test("links, then the provider signs in to that account; a provider account already used elsewhere is refused", async () => {
    const { roundTrip, cookieFor, mem } = setup();
    const res = await roundTrip("google", "link", { sub: "G-A" }, { cookie: await cookieFor(alice), returnTo: "/settings" });
    expect(res.headers.get("location")).toBe(`${ORIGIN}/settings?sso=linked`);
    expect((await mem.store.findUser("google", "G-A"))?.id).toBe(alice.id);
    expect(mem.actions).toEqual(["sso.link"]);
    const taken = await roundTrip("google", "link", { sub: "G-A" }, { cookie: await cookieFor(bob), returnTo: "/settings" });
    expect(taken.headers.get("location")).toBe(`${ORIGIN}/settings?sso_error=sso_taken`);
  });

  test("the callback must come back to the account that started it", async () => {
    const { call, cookieFor, cookieValue, setNonce } = setup();
    const start = await call("POST", "/google/link", { body: { returnTo: "/settings" }, cookie: await cookieFor(alice) });
    const raw = cookieValue(start, "ktrg_sso")!;
    setNonce(decodeFlow(raw)!.nonce);
    const res = await call("GET", `/google/callback?code=c&state=${decodeFlow(raw)!.state}`, { cookie: `${await cookieFor(bob)}; ktrg_sso=${raw}` });
    expect(res.headers.get("location")).toContain("sso_error=sso_failed");
  });
});

describe("the fresh-login re-check with a provider", () => {
  test("staff cannot use it either (the re-check would also open the admin screens)", async () => {
    const { roundTrip, cookieFor, mem } = setup();
    await mem.store.link(editor.id, "line", "U-ED");
    const res = await roundTrip("line", "reauth", { sub: "U-ED" }, { cookie: await cookieFor(editor, false), returnTo: "/settings" });
    expect(res.headers.get("location")).toContain("sso_error=sso_staff");
  });

  test("the linked provider account makes the session fresh; someone else's does not", async () => {
    const { roundTrip, cookieFor, call, mem } = setup();
    await mem.store.link(bob.id, "line", "U-BOB");
    const cookie = await cookieFor(bob, false);
    const wrong = await roundTrip("line", "reauth", { sub: "U-OTHER" }, { cookie, returnTo: "/settings" });
    expect(wrong.headers.get("location")).toContain("sso_error=sso_not_yours");
    expect((await call("POST", "/google/link", { body: {}, cookie })).status).toBe(403);
    const ok = await roundTrip("line", "reauth", { sub: "U-BOB" }, { cookie, returnTo: "/settings" });
    expect(ok.headers.get("location")).toBe(`${ORIGIN}/settings?sso=checked`);
    expect((await call("POST", "/google/link", { body: {}, cookie })).status).toBe(200);
  });
});

describe("linked accounts in settings", () => {
  test("lists only your own; another person's cannot be removed", async () => {
    const { call, cookieFor, mem } = setup();
    await mem.store.link(alice.id, "google", "G-A");
    await mem.store.link(bob.id, "line", "U-B");
    await mem.store.link(bob.id, "google", "G-B");
    const list = (await (await call("GET", "/identities", { cookie: await cookieFor(bob) })).json()) as { identities: { id: string; provider: string }[] };
    expect(list.identities.map((i) => i.provider)).toEqual(["line", "google"]);
    const alicesId = (await mem.store.list(alice.id))[0]!.id;
    expect((await call("DELETE", `/identities/${alicesId}`, { cookie: await cookieFor(bob) })).status).toBe(404);
    expect(await mem.store.findUser("google", "G-A")).not.toBeNull();
  });

  test("the last way into an account without email or passkey stays; with an email it can go", async () => {
    const { call, cookieFor, mem } = setup();
    await mem.store.link(bob.id, "line", "U-B");
    const bobs = (await mem.store.list(bob.id))[0]!.id;
    const res = await call("DELETE", `/identities/${bobs}`, { cookie: await cookieFor(bob) });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "last_login_method" });
    await mem.store.link(alice.id, "line", "U-A");
    const alices = (await mem.store.list(alice.id))[0]!.id;
    expect((await call("DELETE", `/identities/${alices}`, { cookie: await cookieFor(alice, false) })).status).toBe(403); // needs a fresh login
    expect((await call("DELETE", `/identities/${alices}`, { cookie: await cookieFor(alice) })).status).toBe(200);
  });
});

describe("Apple's posted answer", () => {
  test("is let past the Origin check and turned into a visit of the callback; other foreign posts are not", async () => {
    const { call } = setup();
    const res = await call("POST", "/apple/callback", { origin: "https://appleid.apple.com", form: "code=c1&state=s1" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/api/v1/auth/sso/apple/callback?code=c1&state=s1`);
    expect((await call("POST", "/google/login", { origin: "https://appleid.apple.com", body: {} })).status).toBe(403);
    expect((await call("POST", "/apple/callback", { origin: "https://evil.example", form: "code=c1&state=s1" })).status).toBe(403);
  });

  test("never carries Apple's `user` field (name and email) into the address", async () => {
    const { call } = setup();
    const user = encodeURIComponent(JSON.stringify({ name: { firstName: "Hanako" }, email: "hanako@example.com" }));
    const res = await call("POST", "/apple/callback", { origin: "https://appleid.apple.com", form: `code=c1&state=s1&user=${user}` });
    expect(res.status).toBe(303);
    const location = res.headers.get("location")!;
    expect(location).toBe(`${ORIGIN}/api/v1/auth/sso/apple/callback?code=c1&state=s1`);
    expect(location).not.toContain("Hanako");
  });
});
