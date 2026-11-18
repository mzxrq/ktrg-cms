import { describe, expect, test } from "bun:test";
import { boxOf, choiceOf, courseFeatures, pointFeatures, type OverviewCourse, type OverviewPlace, type OverviewSpot } from "./one-map";
import { editorPlacesOf } from "./editor-places";
import { emptyDraft, type PlaceDraft } from "./route-draft";

const course = (id: string): OverviewCourse => ({ id, nameJa: id, nameEn: null, sortOrder: 0, open: false, lineVerified: true, line: [[135, 34], [135.1, 34.1]] });
const spot = (id: string, routeId: string, over: Partial<OverviewSpot> = {}): OverviewSpot => ({ id, routeId, routeIds: [routeId], lat: 34, lng: 135, nameJa: id, kind: "mound", stampable: true, stopBy: false, published: true, positionVerified: true, status: "open", ...over });
const place: OverviewPlace = { id: "shop", lat: 34, lng: 135, nameJa: "売店", category: "cafe", published: false, positionVerified: true, status: "unknown" };

describe("courseFeatures", () => {
  test("no course chosen: every line plain", () => {
    const f = courseFeatures([course("a"), course("b")], null).features;
    expect(f.map((x) => x.properties)).toEqual([{ id: "a", chosen: false, faint: false }, { id: "b", chosen: false, faint: false }]);
  });
  test("a course chosen: it is drawn last (on top), the others faint", () => {
    const f = courseFeatures([course("a"), course("b"), course("c")], "a").features;
    expect(f.map((x) => x.properties)).toEqual([{ id: "b", chosen: false, faint: true }, { id: "c", chosen: false, faint: true }, { id: "a", chosen: true, faint: false }]);
  });
});

describe("pointFeatures", () => {
  test("the chosen course's own waypoints are left to the pins; shared ones are raised and on top; the rest faint", () => {
    const f = pointFeatures({ spots: [spot("own", "a"), spot("other", "b"), spot("shared", "b", { routeIds: ["b", "a"] })], places: [place] }, "a").features;
    expect(f.map((x) => [x.properties.id, x.properties.raised, x.properties.faint])).toEqual([["shop", false, true], ["other", false, true], ["shared", true, false]]);
  });
  test("nothing chosen: every waypoint is a dot, none faint", () => {
    const f = pointFeatures({ spots: [spot("x", "a")], places: [] }, null).features;
    expect(f.map((x) => [x.properties.id, x.properties.faint])).toEqual([["x", false]]);
  });
  test("a draft or an unchecked position is hollow (draft)", () => {
    const f = pointFeatures({ spots: [spot("d", "b", { published: false }), spot("u", "b", { positionVerified: false }), spot("ok", "b")], places: [place] }, null).features;
    expect(Object.fromEntries(f.map((x) => [x.properties.id, x.properties.draft]))).toEqual({ d: true, u: true, ok: false, shop: true });
  });
});

describe("choiceOf", () => {
  test("the area wins; else the box around the line; with neither, no bounds", () => {
    const line = { type: "LineString" as const, coordinates: [[135, 34.2], [135.3, 34.1]] as [number, number][] };
    expect(choiceOf({ id: "a", nameJa: "A", area: { west: 1, south: 2, east: 3, north: 4 }, geometry: line }).bounds).toEqual([[1, 2], [3, 4]]);
    expect(choiceOf({ id: "a", nameJa: "A", area: null, geometry: line }).bounds).toEqual([[135, 34.1], [135.3, 34.2]]);
    expect(choiceOf({ id: "a", nameJa: "A", geometry: null }).bounds).toBeNull();
  });
});

describe("boxOf", () => {
  test("held to the globe and rounded", () => {
    expect(boxOf({ west: -200, south: -95, east: 135.1234567, north: 34.5 })).toEqual({ west: -180, south: -90, east: 135.12346, north: 34.5 });
  });
});

describe("editorPlacesOf", () => {
  const p = (key: string, over: Partial<PlaceDraft> = {}) => ({ ...emptyDraft().places[0], key, nameJa: key, lat: 34, lng: 135, stampable: true, stopBy: false, kind: "mound", published: false, status: "open", ...over }) as PlaceDraft;
  test("stamp numbers skip waypoints without a stamp; first is the start, last the goal", () => {
    const out = editorPlacesOf({ walkStyle: null, places: [p("a"), p("b", { stampable: false }), p("c")] });
    expect(out.map((x) => [x.key, x.number, x.role])).toEqual([["a", 1, "start"], ["b", null, undefined], ["c", 2, "goal"]]);
  });
  test("a loop: the first is both start and goal", () => {
    const out = editorPlacesOf({ walkStyle: "loop", places: [p("a"), p("c")] });
    expect(out.map((x) => x.role)).toEqual(["both", undefined]);
  });
});
