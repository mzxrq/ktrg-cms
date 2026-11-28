import { describe, expect, test } from "bun:test";
import { draftFromServer, draftReducer, initialState, placeFromServer } from "./route-draft";
import { planSave } from "./save-plan";
import type { AdminRoute, AdminSpot } from "./types";

const T = "2026-10-19T00:00:00.000Z";
const route = { id: "r1", nameJa: "R", nameEn: null, translations: {}, descriptionJa: null, descriptionEn: null, distanceKm: null, elevationGainM: null, difficulty: null, nameKana: null, physicalLevel: null, technicalLevel: null, expectedTimeMin: null, prefecture: "osaka", walkStyle: null, municipalities: ["x"], geometry: null, lineVerified: false, lineSource: null, videoUrl: null, videoUrlEn: null, videoSubtitlesEn: false, videoSubtitles: false, historyJa: null, historyEn: null, accessJa: null, accessEn: null, photoUrl: null, sortOrder: 1, createdAt: T, updatedAt: T } as unknown as AdminRoute;
const spot = (id: string, o: Partial<AdminSpot> = {}) => ({ id, routeId: "r1", nameJa: id, nameEn: null, translations: {}, descriptionJa: null, descriptionEn: null, historyJa: null, historyEn: null, lat: 34, lng: 135, positionVerified: true, positionSource: "src", radiusM: 50, kind: "mound", stampable: true, stopBy: false, detached: false, stampSpotId: null, photoUrl: null, photos: [], status: "open", statusNoteJa: null, statusNoteEn: null, statusUpdatedAt: null, sortOrder: 1, published: false, permissionConfirmed: true, permissionNote: null, createdAt: T, updatedAt: T, ...o }) as unknown as AdminSpot;

describe("undo and the server's own state", () => {
  test("undo after publishing a waypoint never unpublishes it on the next save", () => {
    const saved0 = draftFromServer(route, [spot("a"), spot("b", { lat: 34.01, lng: 135.01 })]);
    let s = initialState(saved0);
    s = draftReducer(s, { type: "movePlace", key: "b", lat: 34.02, lng: 135.02 });
    const live = { ...placeFromServer(spot("a", { published: true, updatedAt: "2026-10-20T00:00:00.000Z" })), key: "a" };
    s = draftReducer(s, { type: "savedPlace", key: "a", place: live });
    const saved1 = { ...saved0, places: saved0.places.map((p) => (p.key === "a" ? live : p)) };
    s = draftReducer(s, { type: "undo" });
    expect(s.present.places[0]!.published).toBe(true);
    expect(planSave(s.present, saved1).some((x) => x.op === "unpublishSpot")).toBe(false);
  });

  test("a link that is cleared is sent before a link that points at that place", () => {
    const saved = draftFromServer(route, [spot("a"), spot("b", { stampSpotId: "c" }), spot("c")]);
    const edited = { ...saved, places: saved.places.map((p) => (p.key === "a" ? { ...p, stampSpotId: "b" } : p.key === "b" ? { ...p, stampSpotId: null } : p)) };
    const order = planSave(edited, saved).flatMap((x) => (x.op === "updateSpot" && "stampSpotId" in x.body ? [x.key] : []));
    expect(order).toEqual(["b", "a"]);
  });
});
