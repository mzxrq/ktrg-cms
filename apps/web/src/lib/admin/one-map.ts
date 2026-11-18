import type { LayerSpecification } from "maplibre-gl";
import type { PointKind } from "@/lib/point-kinds";
import type { AdminRoute } from "./types";

// The admin's one map (docs/one-map-editor-design.md, step 3): what GET /admin/map/overview answers, and how it is drawn.
// The chosen course's own waypoints are pins (drawn by the page, like the course editor); everything else is drawn here as
// plain map layers: faint course lines, small dots for other courses' waypoints and for directory places. Never clustered
// (every point keeps its own dot). Pure.

export interface OverviewCourse { id: string; nameJa: string; nameEn: string | null; sortOrder: number; open: boolean; lineVerified: boolean; line: [number, number][] }
export interface OverviewSpot { id: string; routeId: string; routeIds: string[]; lat: number; lng: number; nameJa: string; kind: PointKind; stampable: boolean; stopBy: boolean; published: boolean; positionVerified: boolean; status: string }
export interface OverviewPlace { id: string; lat: number; lng: number; nameJa: string; category: string; published: boolean; positionVerified: boolean; status: string }
export interface Overview { tooMany: boolean; routes: OverviewCourse[]; spots: OverviewSpot[]; places: OverviewPlace[] }

/** A course in the selector: every course, also those off screen; `bounds` null when it has no line or area yet. */
export interface CourseChoice { id: string; nameJa: string; bounds: [[number, number], [number, number]] | null }

/** A course for the selector: the editor's own area wins, else the box around its line (as the public course list does). */
export function choiceOf(r: Pick<AdminRoute, "id" | "nameJa" | "area" | "geometry">): CourseChoice {
  if (r.area) return { id: r.id, nameJa: r.nameJa, bounds: [[r.area.west, r.area.south], [r.area.east, r.area.north]] };
  const c = r.geometry?.coordinates ?? [];
  if (c.length === 0) return { id: r.id, nameJa: r.nameJa, bounds: null };
  const lngs = c.map((p) => p[0]!);
  const lats = c.map((p) => p[1]!);
  return { id: r.id, nameJa: r.nameJa, bounds: [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]] };
}

export const COURSE_SOURCE = "one-map-courses";
export const POINT_SOURCE = "one-map-points";
/** A wide, invisible line over the courses: a thin faint line is easy to hit with a click. */
export const COURSE_HIT = `${COURSE_SOURCE}-hit`;
export const POINT_HIT = `${POINT_SOURCE}-dots`;

type Line = { type: "Feature"; properties: { id: string; chosen: boolean; faint: boolean }; geometry: { type: "LineString"; coordinates: [number, number][] } };
type Dot = { type: "Feature"; properties: { id: string; what: "spot" | "place"; routeId: string; raised: boolean; draft: boolean; faint: boolean }; geometry: { type: "Point"; coordinates: [number, number] } };

/** The course lines; the chosen one last, so it is drawn over the others. */
export function courseFeatures(routes: readonly OverviewCourse[], chosen: string | null): { type: "FeatureCollection"; features: Line[] } {
  const features = routes.map((r): Line => ({ type: "Feature", properties: { id: r.id, chosen: r.id === chosen, faint: chosen !== null && r.id !== chosen }, geometry: { type: "LineString", coordinates: r.line } }));
  return { type: "FeatureCollection", features: [...features.filter((f) => !f.properties.chosen), ...features.filter((f) => f.properties.chosen)] };
}

/**
 * The dots: every waypoint not on its home course's pins (the chosen course's own waypoints are pins), and every directory
 * place. A waypoint the chosen course shares from another course is raised (it is on the chosen course too). A draft or a
 * position nobody has checked is a hollow dot: the same "not for visitors yet" as the editor's 下書き.
 */
export function pointFeatures(o: Pick<Overview, "spots" | "places">, chosen: string | null): { type: "FeatureCollection"; features: Dot[] } {
  const spots = o.spots
    .filter((s) => s.routeId !== chosen)
    .map((s): Dot => {
      const raised = chosen !== null && s.routeIds.includes(chosen);
      return { type: "Feature", properties: { id: s.id, what: "spot", routeId: s.routeId, raised, draft: !s.published || !s.positionVerified, faint: chosen !== null && !raised }, geometry: { type: "Point", coordinates: [s.lng, s.lat] } };
    });
  const places = o.places.map((p): Dot => ({ type: "Feature", properties: { id: p.id, what: "place", routeId: "", raised: false, draft: !p.published || !p.positionVerified, faint: chosen !== null }, geometry: { type: "Point", coordinates: [p.lng, p.lat] } }));
  // Raised dots last, so they are drawn on top.
  const all = [...places, ...spots];
  return { type: "FeatureCollection", features: [...all.filter((d) => !d.properties.raised), ...all.filter((d) => d.properties.raised)] };
}

/** The box asked of the API: the map's view held to the globe (a view wider than the world wraps past ±180), 5 decimals (~1 m). */
export function boxOf(b: { west: number; south: number; east: number; north: number }) {
  const r = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)) * 1e5) / 1e5;
  return { west: r(b.west, -180, 180), south: r(b.south, -90, 90), east: r(b.east, -180, 180), north: r(b.north, -90, 90) };
}

/** Fixed colours: the map tiles do not change with the app theme (as in leg-map.ts). Chosen = the editor's red line. The legend reads them too. */
export const ONE_MAP_COLOURS = { chosen: "#d22d1f", course: "#6d28d9", place: "#0f766e", hollow: "#ffffff" } as const;
const C = ONE_MAP_COLOURS;
export function oneMapLayers(): LayerSpecification[] {
  return [
    // With a course chosen, the others are faint; with none chosen, every course is drawn plainly.
    { id: `${COURSE_SOURCE}-casing`, type: "line", source: COURSE_SOURCE, filter: ["get", "chosen"], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": C.hollow, "line-opacity": 0.9, "line-width": 11 } },
    { id: `${COURSE_SOURCE}-line`, type: "line", source: COURSE_SOURCE, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["case", ["get", "chosen"], C.chosen, C.course], "line-width": ["case", ["get", "chosen"], 6, 3.5], "line-opacity": ["case", ["get", "chosen"], 1, ["get", "faint"], 0.35, 0.85] } },
    { id: COURSE_HIT, type: "line", source: COURSE_SOURCE, layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#000000", "line-opacity": 0, "line-width": 18 } },
    {
      id: POINT_HIT,
      type: "circle",
      source: POINT_SOURCE,
      paint: {
        // A waypoint is a purple dot (the course colour), a directory place a teal one; a raised dot (on the chosen course too) is bigger and red.
        "circle-radius": ["case", ["get", "raised"], 7, 5],
        "circle-color": ["case", ["get", "draft"], C.hollow, ["get", "raised"], C.chosen, ["==", ["get", "what"], "spot"], C.course, C.place],
        "circle-stroke-color": ["case", ["get", "raised"], C.chosen, ["==", ["get", "what"], "spot"], C.course, C.place],
        "circle-stroke-width": ["case", ["get", "draft"], 2.5, 1.5],
        "circle-opacity": ["case", ["get", "faint"], 0.45, 1],
        "circle-stroke-opacity": ["case", ["get", "faint"], 0.45, 1],
      },
    },
  ];
}
