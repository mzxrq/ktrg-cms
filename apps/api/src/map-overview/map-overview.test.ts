import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { createMemoryAuditWriter } from "../audit/audit-log";
import { createRateLimiter } from "../auth/rate-limit";
import { createMemoryRateLimitStore } from "../auth/rate-limit-memory-store";
import { createMemorySessionStore } from "../auth/session-memory-store";
import { createSessionService } from "../auth/session-service";
import type { AuthUser } from "../auth/user";
import { createMemoryContentStore } from "../content/content-memory-store";
import { apiBase } from "../lib/api-errors";
import { createMemoryPlaceStore } from "../places/place-directory";
import { createMapOverviewService, mapOverviewRoutes, OVERVIEW_LIMIT } from "./map-overview";

const admin: AuthUser = { id: "11111111-1111-4111-8111-111111111111", email: "admin@example.com", role: "admin", locale: "ja" };
const editor: AuthUser = { id: "33333333-3333-4333-8333-333333333333", email: "editor@example.com", role: "editor", locale: "ja" };
const alice: AuthUser = { id: "22222222-2222-4222-8222-222222222222", email: "alice@example.com", role: "participant", locale: "ja" };
// Around Tomogashima; a second area far away (Nara) holds what must be left out.
const BOX = "west=134.9&south=34.2&east=135.2&north=34.4";

async function setup() {
  const users = new Map<string, AuthUser>([admin, editor, alice].map((u) => [u.id, { ...u }]));
  const session = createSessionService({ store: createMemorySessionStore(users).store });
  const audit = createMemoryAuditWriter();
  const content = createMemoryContentStore(audit.writer).store;
  const places = createMemoryPlaceStore(audit.writer).store;
  const mapOverview = createMapOverviewService({ routes: () => content.listRoutes(), spotsInBox: (b, l) => content.spotsInBox(b, l), placesInBox: (b, l) => places.inBox(b, l) });
  const rateLimit = createRateLimiter({ store: createMemoryRateLimitStore().store, secret: "m".repeat(32) });
  const services = { session, rateLimit, audit: audit.writer, mapOverview };
  const app = new Elysia({ prefix: "/api/v1" }).use(apiBase()).use(mapOverviewRoutes(() => services, { secureCookies: false }));
  const call = (path: string, cookie?: string) => app.handle(new Request(`http://localhost/api/v1${path}`, { headers: cookie ? { cookie } : {} }));
  const login = async (u: AuthUser) => `session=${(await session.create(users.get(u.id)!)).token}`;

  const near = await content.createRoute(admin.id, { nameJa: "友ヶ島", geometry: { type: "LineString", coordinates: [[135.0, 34.28], [135.05, 34.29]] } });
  const far = await content.createRoute(admin.id, { nameJa: "葛城山", geometry: { type: "LineString", coordinates: [[135.7, 34.45], [135.72, 34.46]] } });
  await content.createSpot(admin.id, near.id, { nameJa: "序品窟", lat: 34.28, lng: 135.01, kind: "mound", stampable: true });
  await content.createSpot(admin.id, far.id, { nameJa: "山頂", lat: 34.45, lng: 135.71 });
  await content.createSpot(admin.id, near.id, { nameJa: "位置なし" });
  await places.create(admin.id, { nameJa: "売店", category: "souvenir_shop", lat: 34.29, lng: 135.02 } as never);
  await places.create(admin.id, { nameJa: "遠い店", category: "cafe", lat: 34.45, lng: 135.71 } as never);
  return { call, login, content, near };
}

describe("GET /admin/map/overview", () => {
  test("signed out 401, a participant 403; an editor and an admin may read it", async () => {
    const { call, login } = await setup();
    expect((await call(`/admin/map/overview?${BOX}`)).status).toBe(401);
    expect((await call(`/admin/map/overview?${BOX}`, await login(alice))).status).toBe(403);
    expect((await call(`/admin/map/overview?${BOX}`, await login(editor))).status).toBe(200);
    expect((await call(`/admin/map/overview?${BOX}`, await login(admin))).status).toBe(200);
  });

  test("only what is in the box: the course line that crosses it, its placed waypoints, the places there (drafts too)", async () => {
    const { call, login, near } = await setup();
    const body = await (await call(`/admin/map/overview?${BOX}`, await login(admin))).json();
    expect(body.tooMany).toBe(false);
    expect(body.routes.map((r: { id: string }) => r.id)).toEqual([near.id]);
    expect(body.routes[0].line).toEqual([[135.0, 34.28], [135.05, 34.29]]);
    expect(body.spots.map((s: { nameJa: string }) => s.nameJa)).toEqual(["序品窟"]);
    expect(body.spots[0]).toMatchObject({ routeId: near.id, kind: "mound", stampable: true, published: false });
    expect(body.places.map((p: { nameJa: string }) => p.nameJa)).toEqual(["売店"]);
  });

  test("a box that is upside down or off the globe is refused", async () => {
    const { call, login } = await setup();
    const cookie = await login(admin);
    for (const q of ["west=135.2&south=34.2&east=134.9&north=34.4", "west=134.9&south=34.4&east=135.2&north=34.2", "west=200&south=34&east=210&north=35", "west=a&south=34&east=135&north=35", "west=135&south=34"]) {
      expect({ q, status: (await call(`/admin/map/overview?${q}`, cookie)).status }).toEqual({ q, status: 422 });
    }
  });

  test("more waypoints than the limit: the first ones come, and the answer says to zoom in", async () => {
    const { call, login, content, near } = await setup();
    for (let i = 0; i < OVERVIEW_LIMIT; i++) await content.createSpot(admin.id, near.id, { nameJa: `点${i}`, lat: 34.3, lng: 135.1 });
    const body = await (await call(`/admin/map/overview?${BOX}`, await login(admin))).json();
    expect(body.tooMany).toBe(true);
    expect(body.spots).toHaveLength(OVERVIEW_LIMIT);
  });
});
