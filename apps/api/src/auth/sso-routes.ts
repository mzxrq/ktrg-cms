import { Elysia, t } from "elysia";
import { localeSchema, oneOf } from "../lib/schemas";
import { fail, type SetLike } from "./http";
import { routeKit, type KitServices, type RouteOptions } from "./route-kit";
import { clearSessionCookie, readCookie, serializeSessionCookie } from "./session";
import { SSO_FLOW_MS, SSO_PROVIDERS, ssoCookieName, withQuery, type Sso, type SsoFlow, type SsoMode, type SsoProvider } from "./sso";
import type { SsoService } from "./sso-service";

export interface SsoServices extends KitServices {
  sso: SsoService;
  /** The provider side (URLs, code exchange). Absent: no provider is set up. */
  ssoProviders?: Sso;
}

const providerParams = t.Object({ provider: oneOf(SSO_PROVIDERS) });
const returnTo = t.Optional(t.String({ maxLength: 300 }));
/** Started in the home-screen app: LINE must not jump to its own app, which comes back to Safari, not to ours. */
const installedApp = t.Optional(t.Boolean());

/** What the provider sends back, in the query (Google, LINE) or a form (Apple). Only checked as strings; the state decides. */
const callbackFields = t.Object({
  code: t.Optional(t.String({ maxLength: 2048 })),
  state: t.Optional(t.String({ maxLength: 200 })),
  error: t.Optional(t.String({ maxLength: 200 })),
});

/**
 * Sign in with Google, LINE or Apple (auth/sso.ts). The browser leaves for the provider and comes back to the callback,
 * which answers with a redirect to a page of the site, adding `?sso_error=<code>` when something went wrong. The flow's
 * state, nonce and PKCE verifier wait in an HttpOnly cookie, so no server memory is needed.
 */
export function ssoRoutes(getServices: () => SsoServices, opts: RouteOptions & { appOrigin?: () => string }) {
  const { http, plugins } = routeKit(getServices, opts);
  const cookieName = ssoCookieName(opts.secureCookies);
  const origin = () => opts.appOrigin?.() ?? "";

  /** Several cookies in one answer (the session and the cleared flow): Elysia sends each line of an array. */
  function addCookie(set: SetLike, cookie: string) {
    const before = set.headers["set-cookie"] as unknown as string | string[] | undefined;
    (set.headers as Record<string, unknown>)["set-cookie"] = before === undefined ? cookie : [...(Array.isArray(before) ? before : [before]), cookie];
  }

  /** Step 1: remember the flow in the cookie and give back the provider's address; the page then goes there. */
  function begin(set: SetLike, provider: SsoProvider, mode: SsoMode, o: { locale?: "ja" | "en"; returnTo?: string; userId?: string; installedApp?: boolean }) {
    const sso = getServices().ssoProviders;
    if (!sso?.enabled(provider)) return fail(set, 404, "sso_unavailable");
    const flow = sso.newFlow(provider, mode, { locale: o.locale ?? "ja", returnTo: o.returnTo, userId: o.userId });
    addCookie(set, serializeSessionCookie({ name: cookieName, value: sso.sealFlow(flow), maxAgeSec: SSO_FLOW_MS / 1000, secure: opts.secureCookies }));
    return { ok: true as const, url: sso.authorizeUrl(flow, { installedApp: o.installedApp }) };
  }

  return (
    new Elysia({ prefix: "/auth/sso", detail: { tags: ["Auth"] } })
      .use(plugins)
      // For the buttons: which providers this site has set up (none: no buttons).
      .get("/providers", () => ({ ok: true as const, providers: getServices().ssoProviders?.providers() ?? [] }))
      .post("/:provider/login", ({ params, body, set }) => begin(set, params.provider, "login", body), {
        params: providerParams,
        body: t.Object({ locale: t.Optional(localeSchema), returnTo, installedApp }),
        rateLimit: { ssoStartIp: "ip" },
      })
      // Add the provider to the signed-in account. Participants only, after a fresh login (like adding a passkey).
      .post("/:provider/link", ({ params, body, user, set }) => begin(set, params.provider, "link", { locale: user.locale, returnTo: body.returnTo, userId: user.id, installedApp: body.installedApp }), {
        params: providerParams,
        body: t.Object({ returnTo, installedApp }),
        auth: "me.sso",
        rateLimit: { ssoStartIp: "ip" },
      })
      // The fresh-login re-check for an account that signs in with the provider (it may have no email or passkey).
      .post("/:provider/reauth", ({ params, body, user, set }) => begin(set, params.provider, "reauth", { locale: user.locale, returnTo: body.returnTo, userId: user.id, installedApp: body.installedApp }), {
        params: providerParams,
        body: t.Object({ returnTo, installedApp }),
        auth: "me.manage",
        rateLimit: { ssoStartIp: "ip" },
      })
      // Apple posts its answer from appleid.apple.com (the Origin check lets this one path through: lib/api-errors.ts).
      // Nothing changes here: it turns the post into a plain visit of the callback, where the flow cookie (SameSite=Lax) is sent.
      .post(
        "/apple/callback",
        ({ body, redirect }) => {
          // Only these three, by name: on the first authorization Apple also posts `user` (name and email), which must never
          // reach a URL (history, access logs).
          const q = new URLSearchParams();
          for (const k of ["code", "state", "error"] as const) if (body[k]) q.set(k, body[k]);
          return redirect(`${origin()}/api/v1/auth/sso/apple/callback?${q}`, 303);
        },
        { body: t.Object({ ...callbackFields.properties, user: t.Optional(t.String({ maxLength: 2048 })) }), rateLimit: { ssoCallbackIp: "ip" } },
      )
      .get(
        "/:provider/callback",
        async ({ params, query, headers, set, redirect }) => {
          const raw = readCookie(headers.cookie, cookieName);
          const flow = raw ? (getServices().ssoProviders?.openFlow(raw) ?? null) : null;
          // The flow is used up whatever happens. Added last, after the session cookie (startSession sets the header whole).
          const back = (path: string) => {
            addCookie(set, clearSessionCookie(cookieName, opts.secureCookies));
            return redirect(`${origin()}${path}`, 302);
          };
          const failed = (code: string, f: SsoFlow | null = flow) =>
            back(withQuery(!f || f.mode === "login" ? "/login" : f.returnTo, "sso_error", code));

          // The state ties the answer to this browser's own start: without it anyone could sign a visitor in as themselves.
          if (!flow || flow.provider !== params.provider || !query.state || query.state !== flow.state) return failed("sso_failed", null);
          // The person pressed cancel at the provider.
          if (query.error || !query.code) return failed("sso_cancelled");
          const providers = getServices().ssoProviders;
          const claims = providers ? await providers.finish(flow, query.code) : null;
          if (!claims) return failed("sso_failed");
          const { sso, session } = getServices();

          if (flow.mode === "login") {
            const result = await sso.login(flow.provider, claims, flow.locale);
            if (!result.ok) return failed(result.error);
            // A full login, like a passkey: the provider checked the person just now.
            await http.startSession(set, result.user);
            // A new account meets the set-up screen first, as after any sign-up, then goes where it was going.
            return back(result.created ? `/welcome?next=${encodeURIComponent(flow.returnTo)}` : flow.returnTo);
          }

          // link and reauth: the same account must still be signed in on this browser.
          const auth = await http.session(headers, set);
          if (!auth || auth.user.id !== flow.userId) return failed("sso_failed");
          if (flow.mode === "link") {
            if (auth.user.role !== "participant") return failed("sso_staff");
            // Checked again here, not only at the start: the link must follow a fresh login even if the cookie were forged.
            if (!auth.fresh) return failed("reauth_required");
            if ((await sso.link(auth.user.id, flow.provider, claims.subject)) === "taken") return failed("sso_taken");
            // A new way in: every other device is signed out, this one stays (as for a new email).
            await session.endOthers(auth.user.id, auth.sessionId);
            return back(withQuery(flow.returnTo, "sso", "linked"));
          }
          // Staff never use a provider, here too: the re-check also opens the admin screens (staffCheckedUntil).
          if (auth.user.role !== "participant") return failed("sso_staff");
          if (!(await sso.owns(auth.user.id, flow.provider, claims.subject))) return failed("sso_not_yours");
          await session.markFresh(auth.sessionId);
          await getServices().audit.record({ actorUserId: auth.user.id, action: "session.reauth", targetId: auth.user.id });
          return back(withQuery(flow.returnTo, "sso", "checked"));
        },
        { params: providerParams, query: callbackFields, rateLimit: { ssoCallbackIp: "ip" } },
      )
      // The linked accounts, for the settings screen. Only the provider and when: the provider's id for the person stays here.
      .get(
        "/identities",
        async ({ user }) => ({
          ok: true as const,
          identities: (await getServices().sso.list(user.id)).map((i) => ({ id: i.id, provider: i.provider, createdAt: i.createdAt.toISOString() })),
        }),
        { auth: "me.manage" },
      )
      .delete(
        "/identities/:id",
        async ({ params, user, authSession, set }) => {
          const result = await getServices().sso.unlink(user.id, params.id);
          if (result === "not_found") return fail(set, 404, "not_found");
          if (result === "last") return fail(set, 409, "last_login_method");
          await getServices().session.endOthers(user.id, authSession.id);
          return { ok: true as const };
        },
        { params: t.Object({ id: t.String({ format: "uuid" }) }), auth: "me.sensitive", rateLimit: { ssoUnlinkUser: "user.id" } },
      )
  );
}
