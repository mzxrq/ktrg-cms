import { beforeEach, describe, expect, test } from "bun:test";
import { createMemoryAuditWriter } from "../audit/audit-log";
import { createMemoryContentStore } from "./content-memory-store";
import { createContentService, withShared } from "./content-service";
import { lineLengthKm } from "./line";
import type { RouteRow, SpotRow } from "./content-types";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const LINE = { type: "LineString", coordinates: [[135, 34], [135, 34.01]] };

let audit: ReturnType<typeof createMemoryAuditWriter>;
let mem: ReturnType<typeof createMemoryContentStore>;
let svc: ReturnType<typeof createContentService>;

beforeEach(() => {
  audit = createMemoryAuditWriter();
  mem = createMemoryContentStore(audit.writer);
  svc = createContentService({ store: mem.store });
});

async function route(fields: Record<string, unknown> = {}): Promise<RouteRow> {
  const r = await svc.createRoute(ADMIN, { nameJa: "甲山から孝子越え", ...fields });
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}
async function spot(routeId: string, fields: Record<string, unknown> = {}): Promise<SpotRow> {
  const r = await svc.createSpot(ADMIN, routeId, { nameJa: "虎島の経塚", ...fields });
  if (!r.ok) throw new Error(r.reason);
  return r.value;
}

describe("photo hosts and distance", () => {
  test("with PHOTO_HOSTS set, a photo from another host is refused; without it any https address passes", async () => {
    const limited = createContentService({ store: mem.store, photoHosts: ["photos.example.com"] });
    const made = await limited.createRoute(ADMIN, { nameJa: "甲山", photoUrl: "https://photos.example.com/a.jpg" });
    expect(made.ok).toBe(true);
    const other = await limited.createRoute(ADMIN, { nameJa: "甲山", photoUrl: "https://elsewhere.example/a.jpg" });
    expect(other).toEqual({ ok: false, reason: "invalid_photo_url" });
    expect((await svc.createRoute(ADMIN, { nameJa: "甲山", photoUrl: "https://elsewhere.example/a.jpg" })).ok).toBe(true);
  });

  test("a video link that is replaced or removed is kept in the route's video history, newest first, each once", async () => {
    const r = await route();
    const A = "https://www.youtube.com/watch?v=aaaaaaaaaaa";
    const B = "https://www.youtube.com/watch?v=bbbbbbbbbbb";
    const set = async (url: string | null) => {
      const cur = await svc.getRoute(r.id);
      if (!cur) throw new Error("no route");
      const res = await svc.updateRoute(ADMIN, r.id, cur.route.updatedAt, { videoUrl: url });
      expect(res.ok).toBe(true);
    };
    expect(await svc.videoHistory(r.id)).toEqual([]);
    await set(A); // the first link replaces nothing
    expect(await svc.videoHistory(r.id)).toEqual([]);
    await set(B);
    await set(A);
    await set(null);
    expect(await svc.videoHistory(r.id)).toEqual([A, B]);
  });

  test("with PHOTO_HOSTS set, Wikimedia photos are accepted too, for the main photo and the video; other hosts are not", async () => {
    const limited = createContentService({ store: mem.store, photoHosts: ["photos.example.com"] });
    const made = await limited.createRoute(ADMIN, { nameJa: "甲山", photoUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Koyama.jpg" });
    expect(made.ok).toBe(true);
    const r = await route();
    expect((await limited.updateRoute(ADMIN, r.id, r.updatedAt, { videoUrl: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Walk.webm" })).ok).toBe(true);
    // The finder's thumbnails come from thumb.wikimedia.org now (with Wikimedia's tracking query on the end).
    expect((await limited.createRoute(ADMIN, { nameJa: "甲山", photoUrl: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/99/Koyama.jpg/1920px-Koyama.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail" })).ok).toBe(true);
    expect(await limited.createRoute(ADMIN, { nameJa: "甲山", photoUrl: "https://commons.wikimedia.org/wiki/File:Koyama.jpg" })).toEqual({ ok: false, reason: "invalid_photo_url" });
  });

  test("the distance is measured on the line as drawn, before it is simplified", async () => {
    const zigzag = { type: "LineString", coordinates: Array.from({ length: 3000 }, (_, i): [number, number] => [135 + (i % 2) * 0.001, 34 + i * 0.0001]) };
    const r = await route({ geometry: zigzag });
    expect(r.distanceKm).toBe(lineLengthKm(zigzag as never));
  });
});

describe("routes", () => {
  test("a stale updatedAt is a conflict and changes nothing; a fresh one saves", async () => {
    const r = await route();
    const first = await svc.updateRoute(ADMIN, r.id, r.updatedAt, { nameEn: "Koyama" });
    expect(first.ok).toBe(true);
    const stale = await svc.updateRoute(ADMIN, r.id, r.updatedAt, { nameEn: "Overwritten" });
    expect(stale).toEqual({ ok: false, reason: "conflict" });
    const now = await svc.getRoute(r.id);
    expect(now?.route.nameEn).toBe("Koyama");
    const second = await svc.updateRoute(ADMIN, r.id, first.ok ? first.value.updatedAt : r.updatedAt, { nameEn: "Koyama 2" });
    expect(second.ok).toBe(true);
  });

  test("the line is checked, simplified and sets the distance; a typed distance wins", async () => {
    const r = await route();
    const withLine = await svc.updateRoute(ADMIN, r.id, r.updatedAt, { geometry: LINE });
    expect(withLine.ok && withLine.value.distanceKm).toBe(1.11);
    const cur = withLine.ok ? withLine.value : r;
    const manual = await svc.updateRoute(ADMIN, r.id, cur.updatedAt, { geometry: LINE, distanceKm: 9.3 });
    expect(manual.ok && manual.value.distanceKm).toBe(9.3);
    const wiggle = { type: "LineString", coordinates: Array.from({ length: 6000 }, (_, i) => [135 + i * 1e-5, 34 + Math.sin(i / 5) * 4e-4]) };
    const big = await svc.updateRoute(ADMIN, r.id, manual.ok ? manual.value.updatedAt : r.updatedAt, { geometry: wiggle });
    expect(big.ok && (big.value.geometry?.coordinates.length ?? 0)).toBeLessThanOrEqual(2000);
  });

  test("bad lines and bad video links are refused", async () => {
    const r = await route();
    expect(await svc.updateRoute(ADMIN, r.id, r.updatedAt, { geometry: { type: "LineString", coordinates: [[135, 34]] } })).toEqual({ ok: false, reason: "invalid_line" });
    for (const url of ["https://example.com/v", "http://youtu.be/dQw4w9WgXcQ", "https://vimeo.com/abc", "https://vimeo.com/123456789"]) {
      expect(await svc.updateRoute(ADMIN, r.id, r.updatedAt, { videoUrl: url })).toEqual({ ok: false, reason: "invalid_video_url" });
    }
    expect((await svc.updateRoute(ADMIN, r.id, r.updatedAt, { videoUrl: "https://youtu.be/dQw4w9WgXcQ" })).ok).toBe(true);
  });

  test("the English video is checked like the Japanese one, saved separately, and can be removed", async () => {
    const r = await route();
    for (const url of ["https://example.com/v", "http://youtu.be/dQw4w9WgXcQ"]) {
      expect(await svc.updateRoute(ADMIN, r.id, r.updatedAt, { videoUrlEn: url })).toEqual({ ok: false, reason: "invalid_video_url" });
    }
    const jp = await svc.updateRoute(ADMIN, r.id, r.updatedAt, { videoUrl: "https://youtu.be/dQw4w9WgXcQ" });
    if (!jp.ok) throw new Error("expected the Japanese video to save");
    const en = await svc.updateRoute(ADMIN, r.id, jp.value.updatedAt, { videoUrlEn: "https://youtu.be/abcdefghijk" });
    expect(en.ok && [en.value.videoUrl, en.value.videoUrlEn]).toEqual(["https://youtu.be/dQw4w9WgXcQ", "https://youtu.be/abcdefghijk"]);
    if (!en.ok) throw new Error("expected the English video to save");
    // Subtitles belong to the English file: set them, and another English video starts without.
    const subs = await svc.updateRoute(ADMIN, r.id, en.value.updatedAt, { videoSubtitlesEn: true });
    if (!subs.ok) throw new Error("expected the subtitles flag to save");
    expect([subs.value.videoSubtitlesEn, subs.value.videoSubtitles]).toEqual([true, false]);
    const swapped = await svc.updateRoute(ADMIN, r.id, subs.value.updatedAt, { videoUrlEn: "https://youtu.be/zzzzzzzzzzz" });
    if (!swapped.ok) throw new Error("expected the swap to save");
    expect(swapped.value.videoSubtitlesEn).toBe(false);
    en.value.updatedAt = swapped.value.updatedAt;
    const gone = await svc.updateRoute(ADMIN, r.id, en.value.updatedAt, { videoUrlEn: null });
    expect(gone.ok && [gone.value.videoUrl, gone.value.videoUrlEn]).toEqual(["https://youtu.be/dQw4w9WgXcQ", null]);
  });

  test("with PHOTO_HOSTS set, an uploaded video must be on one of those hosts", async () => {
    const limited = createContentService({ store: mem.store, photoHosts: ["photos.example.com"] });
    const r = await route();
    expect(await limited.updateRoute(ADMIN, r.id, r.updatedAt, { videoUrl: "https://other.example.com/videos/walk.mp4" })).toEqual({ ok: false, reason: "invalid_video_url" });
    expect((await limited.updateRoute(ADMIN, r.id, r.updatedAt, { videoUrl: "https://photos.example.com/videos/walk.mp4" })).ok).toBe(true);
  });

  test("an uploaded .mp4 or .webm link is a video; other file types are not", async () => {
    const r = await route();
    const up = await svc.updateRoute(ADMIN, r.id, r.updatedAt, { videoUrl: "https://photos.example.com/videos/walk-abc234.mp4" });
    expect(up.ok).toBe(true);
    const again = await route();
    expect(await svc.updateRoute(ADMIN, again.id, again.updatedAt, { videoUrl: "https://photos.example.com/videos/walk.mov" })).toEqual({ ok: false, reason: "invalid_video_url" });
  });

  test("a blank Japanese name is refused; blank optional text becomes empty", async () => {
    expect(await svc.createRoute(ADMIN, { nameJa: "   " })).toEqual({ ok: false, reason: "validation_failed" });
    const r = await route({ nameEn: "  " });
    expect(r.nameEn).toBeNull();
  });

  test("a route with places cannot be deleted; an empty one can", async () => {
    const r = await route();
    await spot(r.id);
    expect(await svc.deleteRoute(ADMIN, r.id)).toEqual({ ok: false, reason: "route_has_places" });
    const empty = await route({ nameJa: "空" });
    expect((await svc.deleteRoute(ADMIN, empty.id)).ok).toBe(true);
    expect(await svc.deleteRoute(ADMIN, empty.id)).toEqual({ ok: false, reason: "not_found" });
  });

  test("reordering needs every route exactly once", async () => {
    const a = await route({ nameJa: "A" });
    const b = await route({ nameJa: "B" });
    expect((await svc.reorderRoutes(ADMIN, [b.id, a.id])).ok).toBe(true);
    expect((await svc.listRoutes()).map((x) => x.nameJa)).toEqual(["B", "A"]);
    expect((await svc.reorderRoutes(ADMIN, [b.id])).ok).toBe(false);
    expect((await svc.reorderRoutes(ADMIN, [b.id, b.id])).ok).toBe(false);
  });
});

describe("places", () => {
  test("a new place is a draft and joins no rally of places by itself (its course counts it through its route)", async () => {
    const r = await route();
    const s = await spot(r.id);
    expect(s).toMatchObject({ published: false, positionVerified: false, radiusM: 50, lat: null, routeId: r.id });
    expect(mem.ralliesListing(s.id)).toEqual([]);
  });

  test("publishing fails in order: no coordinates, position not checked, no permission", async () => {
    const r = await route();
    const s = await spot(r.id);
    expect(await svc.publishSpot(ADMIN, s.id)).toEqual({ ok: false, reason: "no_coordinates" });
    const placed = await svc.updateSpot(ADMIN, s.id, s.updatedAt, { lat: 34.3, lng: 135.1 });
    if (!placed.ok) throw new Error(placed.reason);
    expect(await svc.publishSpot(ADMIN, s.id)).toEqual({ ok: false, reason: "position_not_verified" });
    const checked = await svc.updateSpot(ADMIN, s.id, placed.value.updatedAt, { positionVerified: true, positionSource: "葛城修験 公式サイト" });
    if (!checked.ok) throw new Error(checked.reason);
    expect(await svc.publishSpot(ADMIN, s.id)).toEqual({ ok: false, reason: "permission_required" });
    const allowed = await svc.updateSpot(ADMIN, s.id, checked.value.updatedAt, { permissionConfirmed: true, permissionNote: "寺の住職" });
    if (!allowed.ok) throw new Error(allowed.reason);
    const published = await svc.publishSpot(ADMIN, s.id);
    expect(published.ok && published.value.published).toBe(true);
  });

  test("an info-only place (nobody stands there) needs a checked position and a note, not the site's permission", async () => {
    const r = await route();
    const s = await spot(r.id, { lat: 34.3, lng: 135.1, positionVerified: true, positionSource: "葛城修験 公式サイト", status: "info" });
    expect(await svc.publishSpot(ADMIN, s.id)).toEqual({ ok: false, reason: "note_required" });
    const noted = await svc.updateSpot(ADMIN, s.id, s.updatedAt, { statusNoteJa: "現在、立ち入りできません。" });
    if (!noted.ok) throw new Error(noted.reason);
    const published = await svc.publishSpot(ADMIN, s.id);
    expect(published.ok && published.value).toMatchObject({ published: true, permissionConfirmed: false });
    // Once public it keeps its note, and an ordinary place is still refused without permission.
    expect(await svc.updateSpot(ADMIN, s.id, published.ok ? published.value.updatedAt : s.updatedAt, { statusNoteJa: "  " })).toEqual({ ok: false, reason: "note_required" });
    const plain = await spot(r.id, { lat: 34.3, lng: 135.1, positionVerified: true, positionSource: "公式サイト" });
    expect(await svc.publishSpot(ADMIN, plain.id)).toEqual({ ok: false, reason: "permission_required" });
  });

  test("checking a position needs a source; moving a place cancels the check", async () => {
    const r = await route();
    const s = await spot(r.id, { lat: 34.3, lng: 135.1 });
    expect(await svc.updateSpot(ADMIN, s.id, s.updatedAt, { positionVerified: true })).toEqual({ ok: false, reason: "source_required" });
    const ok = await svc.updateSpot(ADMIN, s.id, s.updatedAt, { positionVerified: true, positionSource: "公式サイト" });
    if (!ok.ok) throw new Error(ok.reason);
    const moved = await svc.updateSpot(ADMIN, s.id, ok.value.updatedAt, { lat: 34.31, lng: 135.1 });
    expect(moved.ok && moved.value.positionVerified).toBe(false);
  });

  test("遥拝: a place points to a waypoint of its course; visitors get that waypoint once it is published and checked", async () => {
    const r = await route();
    const other = await route({ nameJa: "ほかのコース" });
    const ok = { positionVerified: true, positionSource: "公式", permissionConfirmed: true };
    const mound = await spot(r.id, { lat: 34.3, lng: 135.1, detached: true, stampable: true, ...ok });
    const battery = await spot(r.id, { nameJa: "第4砲台跡", lat: 34.2, lng: 135.05, ...ok });
    const elsewhere = await spot(other.id, { nameJa: "よそ", lat: 34.1, lng: 135 });
    // Not itself, not another course's waypoint.
    expect(await svc.updateSpot(ADMIN, mound.id, mound.updatedAt, { stampSpotId: mound.id })).toEqual({ ok: false, reason: "validation_failed" });
    expect(await svc.updateSpot(ADMIN, mound.id, mound.updatedAt, { stampSpotId: elsewhere.id })).toEqual({ ok: false, reason: "validation_failed" });
    const linked = await svc.updateSpot(ADMIN, mound.id, mound.updatedAt, { stampSpotId: battery.id });
    if (!linked.ok) throw new Error(linked.reason);
    // Choosing the waypoint does not cancel the place's own position check.
    expect(linked.value).toMatchObject({ stampSpotId: battery.id, positionVerified: true });
    // One step only: the waypoint others are worshipped from cannot point anywhere itself.
    expect(await svc.updateSpot(ADMIN, battery.id, battery.updatedAt, { stampSpotId: mound.id })).toEqual({ ok: false, reason: "validation_failed" });
    if (!(await svc.publishSpot(ADMIN, mound.id)).ok) throw new Error("publish");
    // The waypoint is still a draft: visitors see no 遥拝 place yet.
    expect((await svc.publicSpot(mound.id))?.stampFrom).toBeNull();
    if (!(await svc.publishSpot(ADMIN, battery.id)).ok) throw new Error("publish battery");
    expect((await svc.publicSpot(mound.id))?.stampFrom).toEqual({ id: battery.id, nameJa: "第4砲台跡", nameEn: null, position: { lat: 34.2, lng: 135.05 }, status: "open" });
    expect((await svc.publicSpot(mound.id))?.position).toMatchObject({ lat: 34.3, lng: 135.1 });
    // The waypoint's page lists the place stamped there (他の獲得できるスタンプ); the place itself lists none.
    expect((await svc.publicSpot(battery.id))?.stampedHere).toEqual([{ id: mound.id, nameJa: mound.nameJa, nameEn: null }]);
    expect((await svc.publicSpot(mound.id))?.stampedHere).toEqual([]);
  });

  test("a published place cannot be moved without checking the new position", async () => {
    const r = await route();
    const s = await spot(r.id, { lat: 34.3, lng: 135.1, positionVerified: true, positionSource: "公式", permissionConfirmed: true });
    const pub = await svc.publishSpot(ADMIN, s.id);
    if (!pub.ok) throw new Error(pub.reason);
    expect(await svc.updateSpot(ADMIN, s.id, pub.value.updatedAt, { lat: 34.5, lng: 135.1 })).toEqual({ ok: false, reason: "position_not_verified" });
    expect(await svc.updateSpot(ADMIN, s.id, pub.value.updatedAt, { permissionConfirmed: false })).toEqual({ ok: false, reason: "permission_required" });
  });

  test("a position is both numbers or neither", async () => {
    const r = await route();
    const s = await spot(r.id);
    expect(await svc.updateSpot(ADMIN, s.id, s.updatedAt, { lat: 34.3 })).toEqual({ ok: false, reason: "validation_failed" });
  });

  test("a stamped place cannot be deleted; unpublishing hides it", async () => {
    const r = await route();
    const s = await spot(r.id, { lat: 34.3, lng: 135.1, positionVerified: true, positionSource: "公式", permissionConfirmed: true });
    await svc.publishSpot(ADMIN, s.id);
    mem.stampPlace(s.id);
    expect(await svc.deleteSpot(ADMIN, s.id)).toEqual({ ok: false, reason: "spot_has_stamps" });
    await svc.unpublishSpot(ADMIN, s.id);
    expect(await svc.publicSpot(s.id)).toBeNull();
  });
});

describe("unpublishing a whole route", () => {
  test("every published place goes back to draft in one step, one audit row each; the route stays listed as coming soon", async () => {
    const r = await route();
    const other = await route({ nameJa: "別のルート" });
    const ready = { lat: 34.3, lng: 135.1, positionVerified: true, positionSource: "公式", permissionConfirmed: true };
    const a = await spot(r.id, ready);
    const b = await spot(r.id, { ...ready, nameJa: "二つ目" });
    const draft = await spot(r.id, { nameJa: "下書き" });
    const elsewhere = await spot(other.id, ready);
    for (const s of [a, b, elsewhere]) await svc.publishSpot(ADMIN, s.id);
    const before = audit.rows.length;
    const done = await svc.unpublishRouteSpots(ADMIN, r.id);
    expect(done.ok && done.value.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
    expect(audit.rows.length - before).toBe(2);
    expect(await svc.publicSpot(a.id)).toBeNull();
    expect(await svc.publicSpot(draft.id)).toBeNull();
    expect(await svc.publicSpot(elsewhere.id)).not.toBeNull();
    expect((await svc.publicRoutes()).find((x) => x.id === r.id)?.status).toBe("soon");
    expect(await svc.unpublishRouteSpots(ADMIN, r.id)).toEqual({ ok: true, value: [] });
    expect(await svc.unpublishRouteSpots(ADMIN, crypto.randomUUID())).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("the route lists", () => {
  test("do not carry the legs of a line, but the editor's own read of one route does", async () => {
    const A = "11111111-1111-4111-8111-111111111111";
    const B = "22222222-2222-4222-8222-222222222222";
    const r = await route({ geometry: { type: "LineString", coordinates: [[135, 34], [135.01, 34.01]], legs: [{ from: A, to: B, coordinates: [[135, 34], [135.01, 34.01]] as [number, number][] }] } });
    const listed = (await svc.listRoutes()).find((x) => x.id === r.id);
    expect(listed?.geometry?.coordinates).toHaveLength(2);
    expect(listed?.geometry && "legs" in listed.geometry).toBe(false);
    expect((await svc.getRoute(r.id))?.route.geometry?.legs).toHaveLength(1);
  });
});

describe("what visitors see", () => {
  test("all routes are listed; places only when published; coordinates only when checked", async () => {
    const r = await route({ geometry: LINE });
    const draft = await spot(r.id, { nameJa: "下書き" });
    const live = await spot(r.id, { nameJa: "公開", lat: 34.3, lng: 135.1, positionVerified: true, positionSource: "公式", permissionConfirmed: true });
    await svc.publishSpot(ADMIN, live.id);
    await route({ nameJa: "準備中のルート" });

    const list = await svc.publicRoutes();
    expect(list.map((x) => [x.nameJa, x.status])).toEqual([["甲山から孝子越え", "ready"], ["準備中のルート", "soon"]]);
    const detail = await svc.publicRoute(r.id);
    expect(detail?.spots.map((s) => s.nameJa)).toEqual(["公開"]);
    expect(detail?.spots[0]?.position).toEqual({ lat: 34.3, lng: 135.1, verified: true });
    expect(detail?.route.line).toBeNull(); // the line is a draft until a person has checked it
    expect(detail?.route.sketch).toBeNull();
    expect(detail?.route.bounds).toBeNull();
    expect(await svc.publicSpot(draft.id)).toBeNull();
  });

  test("the legs of a line are kept for the editor and never reach visitors", async () => {
    const A = "11111111-1111-4111-8111-111111111111";
    const B = "22222222-2222-4222-8222-222222222222";
    const legs = [{ from: A, to: B, coordinates: [[135, 34], [135.005, 34.004], [135.01, 34.01]] as [number, number][] }];
    const r = await route({ geometry: { type: "LineString", coordinates: [[135, 34], [135.005, 34.004], [135.01, 34.01]], legs } });
    const saved = await svc.updateRoute(ADMIN, r.id, r.updatedAt, { lineVerified: true, lineSource: "公式" });
    if (!saved.ok) throw new Error(saved.reason);
    expect((await svc.getRoute(r.id))?.route.geometry?.legs).toEqual(legs);
    const shown = (await svc.publicRoute(r.id))?.route.line;
    expect(shown?.coordinates).toHaveLength(3);
    expect(shown && "legs" in shown).toBe(false);
    // a leg that is not a real stretch between two waypoint ids is refused
    expect(await svc.updateRoute(ADMIN, r.id, saved.value.updatedAt, { geometry: { type: "LineString", coordinates: [[135, 34], [135.01, 34.01]], legs: [{ from: "x", to: B, coordinates: [[135, 34], [135.01, 34.01]] }] } })).toEqual({ ok: false, reason: "invalid_line" });
  });
  test("a side trip is shown only once the place it leads to is published, and apart from the main line", async () => {
    const A = "11111111-1111-4111-8111-111111111111";
    const r = await route({});
    const out = await spot(r.id, { stopBy: true, lat: 34.3, lng: 135.1, positionVerified: true, positionSource: "公式", permissionConfirmed: true });
    const side = [[135, 34], [135.005, 34.004]] as [number, number][];
    const geometry = { type: "LineString" as const, coordinates: [[135, 34], [135.01, 34.01]] as [number, number][], legs: [{ from: A, to: out.id, coordinates: side, side: true as const }] };
    const saved = await svc.updateRoute(ADMIN, r.id, r.updatedAt, { geometry, lineVerified: true, lineSource: "公式" });
    if (!saved.ok) throw new Error(saved.reason);

    expect((await svc.publicRoute(r.id))?.route.sideLines).toEqual([]);
    await svc.publishSpot(ADMIN, out.id);
    const shown = (await svc.publicRoute(r.id))?.route;
    expect(shown?.sideLines).toEqual([{ spotId: out.id, coordinates: side }]);
    expect(shown?.line?.coordinates).toHaveLength(2); // the main line does not take the side trip in
  });

  test("a ridden stretch (ferry ...) reaches visitors with its minutes once its place is published; a bad one is refused", async () => {
    const A = "11111111-1111-4111-8111-111111111111";
    const r = await route({});
    const port = await spot(r.id, { lat: 34.3, lng: 135.1, positionVerified: true, positionSource: "公式", permissionConfirmed: true });
    const coordinates = [[135, 34], [135.01, 34.01]] as [number, number][];
    const line = (ride: unknown) => ({ geometry: { type: "LineString" as const, coordinates, legs: [{ from: A, to: port.id, coordinates, ride }] }, lineVerified: true, lineSource: "公式" });
    const saved = await svc.updateRoute(ADMIN, r.id, r.updatedAt, line({ mode: "ferry", minutes: 20 }) as never);
    if (!saved.ok) throw new Error(saved.reason);

    expect((await svc.publicRoute(r.id))?.route.rides).toEqual([]);
    await svc.publishSpot(ADMIN, port.id);
    expect((await svc.publicRoute(r.id))?.route.rides).toEqual([{ spotId: port.id, mode: "ferry", minutes: 20, start: [135, 34], end: [135.01, 34.01] }]);
    for (const bad of [{ mode: "rocket", minutes: 20 }, { mode: "ferry", minutes: 0 }, { mode: "ferry", minutes: 1.5 }, "ferry"]) {
      expect(await svc.updateRoute(ADMIN, r.id, saved.value.updatedAt, line(bad) as never)).toEqual({ ok: false, reason: "invalid_line" });
    }
  });

  test("a checked line is shown; redrawing it hides it again until it is checked again", async () => {
    const r = await route({ geometry: LINE });
    expect((await svc.publicRoute(r.id))?.route.line).toBeNull();
    expect(await svc.updateRoute(ADMIN, r.id, r.updatedAt, { lineVerified: true })).toEqual({ ok: false, reason: "source_required" });
    const checked = await svc.updateRoute(ADMIN, r.id, r.updatedAt, { lineVerified: true, lineSource: "葛城修験 公式サイト" });
    if (!checked.ok) throw new Error(checked.reason);
    const shown = (await svc.publicRoute(r.id))?.route;
    expect(shown?.line?.coordinates).toHaveLength(2);
    expect(shown?.bounds).not.toBeNull();
    expect(shown?.sketch).not.toBeNull();
    const redrawn = await svc.updateRoute(ADMIN, r.id, checked.value.updatedAt, { geometry: { type: "LineString", coordinates: [[135, 34], [135.02, 34.02]] } });
    expect(redrawn.ok && redrawn.value.lineVerified).toBe(false);
    expect((await svc.publicRoute(r.id))?.route.line).toBeNull();
  });

  test("a route with no line cannot be marked as checked", async () => {
    const r = await route();
    expect(await svc.updateRoute(ADMIN, r.id, r.updatedAt, { lineVerified: true, lineSource: "公式" })).toEqual({ ok: false, reason: "invalid_line" });
  });
});

describe("history, access and photo", () => {
  /** A course's reading reaches visitors once one of its stamp places is published. */
  const open = async (routeId: string) => {
    const s = await spot(routeId);
    await mem.store.setPublished(ADMIN, s.id, true);
  };

  test("they are saved in both languages, blank becomes empty, and a photo must be an https link", async () => {
    const r = await route();
    const saved = await svc.updateRoute(ADMIN, r.id, r.updatedAt, {
      historyJa: "  役行者が修行した道  ",
      historyEn: "",
      accessJa: "近鉄御所駅から徒歩",
      photoUrl: "https://example.com/koyama.jpg",
    });
    expect(saved.ok && saved.value).toMatchObject({ historyJa: "役行者が修行した道", historyEn: null, accessJa: "近鉄御所駅から徒歩", photoUrl: "https://example.com/koyama.jpg" });
    const cur = saved.ok ? saved.value : r;
    for (const bad of ["http://example.com/a.jpg", "javascript:alert(1)", "/images/a.jpg", "x".repeat(501)]) {
      expect(await svc.updateRoute(ADMIN, r.id, cur.updatedAt, { photoUrl: bad })).toEqual({ ok: false, reason: "invalid_photo_url" });
    }
    await open(r.id);
    expect((await svc.publicRoute(r.id))?.route).toMatchObject({ historyJa: "役行者が修行した道", photoUrl: "https://example.com/koyama.jpg" });
  });

  test("the photo's middle is set as a pair, cleared as a pair, and visitors get it", async () => {
    const r = await route();
    const saved = await svc.updateRoute(ADMIN, r.id, r.updatedAt, { photoUrl: "https://example.com/koyama.jpg", photoFocusX: 30, photoFocusY: 75 });
    expect(saved.ok && saved.value).toMatchObject({ photoFocusX: 30, photoFocusY: 75 });
    const cur = saved.ok ? saved.value : r;
    // One without the other, or one cleared and one kept, is refused.
    for (const half of [{ photoFocusX: 10 }, { photoFocusY: 10 }, { photoFocusX: null, photoFocusY: 10 }]) {
      expect(await svc.updateRoute(ADMIN, r.id, cur.updatedAt, half)).toEqual({ ok: false, reason: "validation_failed" });
    }
    await open(r.id);
    expect((await svc.publicRoute(r.id))?.route).toMatchObject({ photoFocusX: 30, photoFocusY: 75 });
    const cleared = await svc.updateRoute(ADMIN, r.id, cur.updatedAt, { photoFocusX: null, photoFocusY: null });
    expect(cleared.ok && cleared.value).toMatchObject({ photoFocusX: null, photoFocusY: null });
  });

  test("the photo credit and the source are trimmed, blank clears them, and visitors get them", async () => {
    const r = await route();
    const saved = await svc.updateRoute(ADMIN, r.id, r.updatedAt, {
      photoCredit: "  撮影：山田 [Commons](https://commons.wikimedia.org/)  ",
      sourceJa: "葛城修験日本遺産",
      sourceEn: "   ",
      photoNameJa: " 金剛山の山頂 ",
      photoNameEn: "  ",
    });
    expect(saved.ok && saved.value).toMatchObject({ photoCredit: "撮影：山田 [Commons](https://commons.wikimedia.org/)", sourceJa: "葛城修験日本遺産", sourceEn: null, photoNameJa: "金剛山の山頂", photoNameEn: null });
    await open(r.id);
    expect((await svc.publicRoute(r.id))?.route).toMatchObject({ photoCredit: "撮影：山田 [Commons](https://commons.wikimedia.org/)", sourceJa: "葛城修験日本遺産", photoNameJa: "金剛山の山頂" });
  });
});

describe("the route's other points (turns, toilets, danger ...)", () => {
  const verified = { lat: 34.3, lng: 135.1, positionVerified: true, positionSource: "公式" };

  test("a new waypoint's stamp switch starts from its kind, unless the request sets it", async () => {
    const r = await route();
    const other = await spot(r.id);
    const temple = await spot(r.id, { nameJa: "寺", kind: "temple" });
    const toilet = await spot(r.id, { nameJa: "トイレ", kind: "toilet" });
    const stampedToilet = await spot(r.id, { nameJa: "トイレ（スタンプあり）", kind: "toilet", stampable: true });
    expect([other.kind, other.stampable]).toEqual(["other", true]);
    expect(temple.stampable).toBe(true);
    expect([toilet.kind, toilet.stampable]).toEqual(["toilet", false]);
    expect(stampedToilet.stampable).toBe(true);
  });

  test("every place needs the site's permission and a checked position to be published, with a stamp or without", async () => {
    const r = await route();
    const toilet = await spot(r.id, { nameJa: "トイレ", kind: "toilet", lat: 34.3, lng: 135.1 });
    expect(await svc.publishSpot(ADMIN, toilet.id)).toEqual({ ok: false, reason: "position_not_verified" });
    const checked = await svc.updateSpot(ADMIN, toilet.id, toilet.updatedAt, { positionVerified: true, positionSource: "現地確認" });
    if (!checked.ok) throw new Error(checked.reason);
    // checked, but no permission yet: a place without a stamp has a page too, so it is refused like a stamp place
    expect(await svc.publishSpot(ADMIN, toilet.id)).toEqual({ ok: false, reason: "permission_required" });
    const allowed = await svc.updateSpot(ADMIN, toilet.id, checked.value.updatedAt, { permissionConfirmed: true });
    if (!allowed.ok) throw new Error(allowed.reason);
    const published = await svc.publishSpot(ADMIN, toilet.id);
    expect(published.ok && published.value.published).toBe(true);
    // and a published one cannot lose the permission
    const lost = await svc.updateSpot(ADMIN, toilet.id, published.ok ? published.value.updatedAt : "", { permissionConfirmed: false });
    expect(lost).toEqual({ ok: false, reason: "permission_required" });
    const stamp = await spot(r.id, { nameJa: "経塚", ...verified });
    expect(await svc.publishSpot(ADMIN, stamp.id)).toEqual({ ok: false, reason: "permission_required" });
  });

  test("a waypoint whose stamp switch goes off leaves every rally of places; a stamped one cannot switch off", async () => {
    const r = await route();
    const s = await spot(r.id);
    mem.listInRally(s.id, "rally-of-places-1");
    mem.listInRally(s.id, "rally-of-places-2");
    const asTurn = await svc.updateSpot(ADMIN, s.id, s.updatedAt, { stampable: false });
    if (!asTurn.ok) throw new Error(asTurn.reason);
    expect(mem.ralliesListing(s.id)).toEqual([]);
    // Switched on again: it does not rejoin by itself (an admin adds it again).
    const back = await svc.updateSpot(ADMIN, s.id, asTurn.value.updatedAt, { stampable: true });
    if (!back.ok) throw new Error(back.reason);
    expect(mem.ralliesListing(s.id)).toEqual([]);
    mem.stampPlace(s.id);
    expect(await svc.updateSpot(ADMIN, s.id, back.value.updatedAt, { stampable: false })).toEqual({ ok: false, reason: "spot_has_stamps" });
  });

  test("a published info-only place (no stamp) does not open a 準備中 course", async () => {
    const r = await route({ geometry: LINE });
    const s = await spot(r.id, { ...verified, status: "info", statusNoteJa: "現在、立ち入りできません。" });
    expect((await svc.publishSpot(ADMIN, s.id)).ok).toBe(true);
    expect((await svc.publicRoutes())[0]).toMatchObject({ status: "soon", publishedSpotCount: 0 });
    expect((await svc.publicRoute(r.id))?.route).toMatchObject({ status: "soon", publishedSpotCount: 0 });
  });

  test("visitors get stamp places and the other points apart; only stamp places make a route ready; the lists count stamp places only", async () => {
    const r = await route({ geometry: LINE });
    const stamp = await spot(r.id, { nameJa: "経塚", ...verified, permissionConfirmed: true });
    const water = await spot(r.id, { nameJa: "水場", kind: "drinking_water", ...verified, permissionConfirmed: true });
    await svc.publishSpot(ADMIN, water.id);
    expect((await svc.publicRoutes())[0]?.status).toBe("soon"); // only a water point is public: no stamp place yet
    await svc.updateRoute(ADMIN, r.id, (await svc.getRoute(r.id))!.route.updatedAt, { descriptionJa: "説明" });
    expect((await svc.publicRoute(r.id))?.route.descriptionJa).toBeNull();
    await svc.publishSpot(ADMIN, stamp.id);
    const detail = await svc.publicRoute(r.id);
    expect(detail?.route.status).toBe("ready");
    expect(detail?.route.descriptionJa).toBe("説明"); // the first stamp place opens the course
    expect(detail?.spots.map((x) => x.nameJa)).toEqual(["経塚"]);
    expect(detail?.points.map((x) => [x.nameJa, x.kind])).toEqual([["水場", "drinking_water"]]);
    const row = (await svc.listRoutes())[0]!;
    expect([row.spotCount, row.publishedSpotCount, row.pointCount]).toEqual([1, 1, 1]);
  });
});

describe("audit", () => {
  test("every change records one entry with the admin and the target, ids only", async () => {
    const r = await route();
    const s = await spot(r.id);
    await svc.updateRoute(ADMIN, r.id, r.updatedAt, { nameEn: "x" });
    await svc.updateSpot(ADMIN, s.id, s.updatedAt, { status: "closed" });
    const actions = audit.rows.map((x) => x.action);
    expect(actions).toEqual(["route.create", "spot.create", "route.update", "spot.update", "spot.status.change"]);
    expect(audit.rows.every((x) => x.actorUserId === ADMIN)).toBe(true);
    expect(audit.rows[0]?.targetId).toBe(r.id);
  });
});

describe("a place's story and gallery", () => {
  const photos = [
    { url: " https://upload.wikimedia.org/a.jpg ", credit: " Taro Yamada, CC BY-SA 4.0 ", sourceUrl: "https://commons.wikimedia.org/wiki/File:A.jpg", nameJa: " 鳥居 ", nameEn: "  " },
    // Saved before photos had names: no name fields at all.
    { url: "https://photos.example.com/b.jpg", credit: "  ", sourceUrl: null },
  ];

  test("the history and the photos are saved cleaned, and visitors get them", async () => {
    const r = await route();
    const s = await spot(r.id, { historyJa: " 役行者が開いたと伝わる。 ", historyEn: "  ", photos, photoNameJa: " 本殿 ", photoNameEn: " Main hall " });
    expect(s).toMatchObject({ historyJa: "役行者が開いたと伝わる。", historyEn: null, photoNameJa: "本殿", photoNameEn: "Main hall" });
    expect(s.photos).toEqual([
      { url: "https://upload.wikimedia.org/a.jpg", credit: "Taro Yamada, CC BY-SA 4.0", sourceUrl: "https://commons.wikimedia.org/wiki/File:A.jpg", nameJa: "鳥居", nameEn: null },
      { url: "https://photos.example.com/b.jpg", credit: null, sourceUrl: null, nameJa: null, nameEn: null },
    ]);
  });

  test("a photo that is not an https link, or a source that is not, is refused", async () => {
    const r = await route();
    expect(await svc.createSpot(ADMIN, r.id, { nameJa: "x", photos: [{ url: "http://a.example/p.jpg", credit: null, sourceUrl: null }] })).toEqual({ ok: false, reason: "invalid_photo_url" });
    expect(await svc.createSpot(ADMIN, r.id, { nameJa: "x", photos: [{ url: "https://a.example/p.jpg", credit: null, sourceUrl: "javascript:alert(1)" }] })).toEqual({ ok: false, reason: "invalid_photo_url" });
  });

  test("the main photo keeps the page it was found on; a source that is not https is refused", async () => {
    const r = await route();
    const s = await spot(r.id, { photoUrl: "https://upload.wikimedia.org/m.jpg", photoSourceUrl: " https://commons.wikimedia.org/wiki/File:M.jpg " });
    expect(s).toMatchObject({ photoSourceUrl: "https://commons.wikimedia.org/wiki/File:M.jpg" });
    expect(await svc.createSpot(ADMIN, r.id, { nameJa: "y", photoUrl: "https://upload.wikimedia.org/m.jpg", photoSourceUrl: "javascript:alert(1)" })).toEqual({ ok: false, reason: "invalid_photo_url" });
    const cleared = await svc.updateSpot(ADMIN, s.id, s.updatedAt, { photoSourceUrl: "  " });
    expect(cleared.ok && cleared.value).toMatchObject({ photoSourceUrl: null });
  });

  test("with PHOTO_HOSTS set, the gallery takes those hosts and Wikimedia, nothing else", async () => {
    const limited = createContentService({ store: mem.store, photoHosts: ["photos.example.com"] });
    const r = await route();
    const add = (url: string) => limited.createSpot(ADMIN, r.id, { nameJa: "x", photos: [{ url, credit: null, sourceUrl: null }] });
    expect((await add("https://photos.example.com/a.jpg")).ok).toBe(true);
    expect((await add("https://upload.wikimedia.org/a.jpg")).ok).toBe(true);
    expect(await add("https://elsewhere.example/a.jpg")).toEqual({ ok: false, reason: "invalid_photo_url" });
  });
});

describe("public route list cache", () => {
  test("is reused within the time, and not at all when unset", async () => {
    const cached = createContentService({ store: mem.store, publicRoutesTtlMs: 60_000 });
    await route();
    expect(await cached.publicRoutes()).toHaveLength(1);
    await route({ nameJa: "もう一つ" });
    expect(await cached.publicRoutes()).toHaveLength(1); // the copy from a moment ago
    expect(await svc.publicRoutes()).toHaveLength(2); // no ttl: always fresh
  });
});

describe("a place on two courses", () => {
  const at = (id: string, sortOrder: number) => ({ id, sortOrder }) as SpotRow;
  const sharedAt = (id: string, position: number) => ({ id, sortOrder: 99, position }) as SpotRow & { position: number };

  test("withShared puts a shared place first by default, in the middle or last, and numbers them 1..n", () => {
    const own = [at("b", 7), at("a", 2), at("c", 9)]; // gaps and disorder in the course's own numbers
    expect(withShared(own, [sharedAt("x", 0)]).map((s) => s.id)).toEqual(["x", "a", "b", "c"]);
    expect(withShared(own, [sharedAt("x", 1)]).map((s) => s.id)).toEqual(["a", "x", "b", "c"]);
    expect(withShared(own, [sharedAt("x", 3)]).map((s) => s.id)).toEqual(["a", "b", "c", "x"]);
    expect(withShared(own, [sharedAt("x", 50)]).map((s) => s.id)).toEqual(["a", "b", "c", "x"]);
    expect(withShared(own, [sharedAt("x", 0), sharedAt("y", 0)]).map((s) => s.sortOrder)).toEqual([1, 2, 3, 4, 5]);
    expect(withShared([], [sharedAt("x", 0)]).map((s) => s.id)).toEqual(["x"]);
  });

  test("a place is shared with another course, listed there apart from its own places, and unshared again", async () => {
    const home = await route({ nameJa: "甲山から孝子越え" });
    const next = await route({ nameJa: "孝子越えから先" });
    const eki = await spot(home.id, { nameJa: "孝子駅" });

    expect(await svc.shareSpot(ADMIN, eki.id, home.id)).toEqual({ ok: false, reason: "validation_failed" }); // its own course
    expect(await svc.shareSpot(ADMIN, "00000000-0000-4000-8000-00000000dead", next.id)).toEqual({ ok: false, reason: "not_found" });
    expect(await svc.shareSpot(ADMIN, eki.id, next.id)).toEqual({ ok: true, value: true });

    const found = await svc.getRoute(next.id);
    expect(found!.spots).toEqual([]);
    expect(found!.shared.map((s) => ({ id: s.id, routeId: s.routeId, position: s.position }))).toEqual([{ id: eki.id, routeId: home.id, position: 0 }]);
    expect((await svc.getRoute(home.id))!.shared).toEqual([]);
    expect((await svc.getRoute(home.id))!.sharedWith).toEqual({ [eki.id]: [next.id] }); // the home course can see it is lent
    expect((await svc.getRoute(next.id))!.sharedWith).toEqual({});

    expect(await svc.unshareSpot(ADMIN, eki.id, next.id)).toEqual({ ok: true, value: true });
    expect(await svc.unshareSpot(ADMIN, eki.id, next.id)).toEqual({ ok: false, reason: "not_found" });
    expect((await svc.getRoute(next.id))!.shared).toEqual([]);
  });
});

// 2026-11-17, user: a mound worshipped from afar (遥拝) is not a side trip, since nobody walks to it.
describe("a place not connected to the route", () => {
  test("is always also a side trip, keeps its label, and stops being detached when it stops being a side trip", async () => {
    const r = await route();
    const s = await spot(r.id, { detached: true, stopBy: false, detachedLabelJa: " 遠くから拝む場所 ", detachedLabelEn: "  " });
    expect(s).toMatchObject({ detached: true, stopBy: true, detachedLabelJa: "遠くから拝む場所", detachedLabelEn: null });
    const back = await svc.updateSpot(ADMIN, s.id, s.updatedAt, { stopBy: false });
    expect(back.ok && back.value).toMatchObject({ stopBy: false, detached: false });
  });
});

// 2026-11-26, user: the fly-along (コースをたどる) is set per waypoint in admin and reaches visitors.
describe("a waypoint's fly-along settings", () => {
  test("are saved trimmed, reach visitors once published, and empty means automatic", async () => {
    const r = await route();
    const ok = { positionVerified: true, positionSource: "公式", permissionConfirmed: true };
    const s = await spot(r.id, { lat: 34.3, lng: 135.1, stampable: true, ...ok });
    expect(s).toMatchObject({ flyShow: null, flySeconds: null, flyPhotoUrl: null, flyNoteJa: null, flyNoteEn: null });
    const set = await svc.updateSpot(ADMIN, s.id, s.updatedAt, {
      flyShow: false, flySeconds: 9, flyPhotoUrl: "https://example.com/a.jpg", flyNoteJa: " ここから急な登りです ", flyNoteEn: "  ",
    });
    if (!set.ok) throw new Error(set.reason);
    expect(set.value).toMatchObject({ flyShow: false, flySeconds: 9, flyPhotoUrl: "https://example.com/a.jpg", flyNoteJa: "ここから急な登りです", flyNoteEn: null });
    const published = await svc.publishSpot(ADMIN, s.id);
    if (!published.ok) throw new Error(published.reason);
    expect(await svc.publicSpot(s.id)).toMatchObject({ flyShow: false, flySeconds: 9, flyPhotoUrl: "https://example.com/a.jpg", flyNoteJa: "ここから急な登りです", flyNoteEn: null });
    const back = await svc.updateSpot(ADMIN, s.id, published.value.updatedAt, { flyShow: null, flySeconds: null, flyPhotoUrl: "" });
    expect(back.ok && back.value).toMatchObject({ flyShow: null, flySeconds: null, flyPhotoUrl: null });
  });

  test("a photo from a host that is not allowed is refused", async () => {
    const limited = createContentService({ store: mem.store, photoHosts: ["photos.example.com"] });
    const r = await route();
    const s = await spot(r.id);
    expect(await limited.updateSpot(ADMIN, s.id, s.updatedAt, { flyPhotoUrl: "https://elsewhere.example/a.jpg" })).toEqual({ ok: false, reason: "invalid_photo_url" });
  });
});
