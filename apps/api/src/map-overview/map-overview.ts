import { Elysia, t } from "elysia";
import { fail } from "../auth/http";
import { routeKit, type KitServices, type RouteOptions } from "../auth/route-kit";
import type { CourseArea } from "../db/schema";
import type { RouteSummaryRow, SpotRow } from "../content/content-types";
import { simplifyLine } from "../content/line";
import type { PlaceRow } from "../places/place-directory";

// The admin's one map (docs/one-map-editor-design.md, step 2): for the area on screen, every course's line (thinned), its
// waypoints and the directory places, drafts included. Read only; editing uses the existing endpoints.

/** At most this many waypoints and this many places in one answer; more means "zoom in". */
export const OVERVIEW_LIMIT = 600;
/** Points per course line: enough to see the course, light enough for every course at once. */
const LINE_POINTS = 300;

export interface MapOverviewDeps {
  routes: () => Promise<RouteSummaryRow[]>;
  spotsInBox: (box: CourseArea, limit: number) => Promise<SpotRow[]>;
  placesInBox: (box: CourseArea, limit: number) => Promise<PlaceRow[]>;
}

const touches = (coords: readonly (readonly (number | undefined)[])[], box: CourseArea) => {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lng, lat] of coords) [w, s, e, n] = [Math.min(w, lng!), Math.min(s, lat!), Math.max(e, lng!), Math.max(n, lat!)];
  return w <= box.east && e >= box.west && s <= box.north && n >= box.south;
};

export function createMapOverviewService(deps: MapOverviewDeps) {
  return {
    /** null when the box is upside down (west east of east, south north of north). */
    async overview(box: CourseArea) {
      if (box.west >= box.east || box.south >= box.north) return null;
      // One query after another: the pooler hangs on many at once (see the pool note).
      const routes = await deps.routes();
      const spots = await deps.spotsInBox(box, OVERVIEW_LIMIT + 1);
      const places = await deps.placesInBox(box, OVERVIEW_LIMIT + 1);
      return {
        // Too much to draw here: the screen asks the admin to zoom in (what came is still drawn).
        tooMany: spots.length > OVERVIEW_LIMIT || places.length > OVERVIEW_LIMIT,
        routes: routes.flatMap((r) =>
          r.geometry && r.geometry.coordinates.length >= 2 && touches(r.geometry.coordinates, box)
            ? [{ id: r.id, nameJa: r.nameJa, nameEn: r.nameEn, sortOrder: r.sortOrder, open: r.publishedSpotCount > 0, lineVerified: r.lineVerified, line: simplifyLine({ type: "LineString", coordinates: r.geometry.coordinates }, LINE_POINTS).coordinates.map(([lng, lat]) => [lng, lat] as [number, number]) }]
            : [],
        ),
        // shortcut: a waypoint is listed under its home course only (spot_routes not read); read route_spots if the map must show the shared ones on each course.
        spots: spots.slice(0, OVERVIEW_LIMIT).map((s) => ({ id: s.id, routeId: s.routeId, lat: s.lat!, lng: s.lng!, nameJa: s.nameJa, kind: s.kind, stampable: s.stampable, stopBy: s.stopBy, published: s.published, positionVerified: s.positionVerified, status: s.status })),
        places: places.slice(0, OVERVIEW_LIMIT).map((p) => ({ id: p.id, lat: p.lat!, lng: p.lng!, nameJa: p.nameJa, category: p.category, published: p.published, positionVerified: p.positionVerified, status: p.status })),
      };
    },
  };
}

export type MapOverviewService = ReturnType<typeof createMapOverviewService>;

export interface MapOverviewServices extends KitServices {
  mapOverview: MapOverviewService;
}

const lng = t.Numeric({ minimum: -180, maximum: 180 });
const lat = t.Numeric({ minimum: -90, maximum: 90 });

export function mapOverviewRoutes(getServices: () => MapOverviewServices, opts: RouteOptions) {
  const { plugins } = routeKit(getServices, opts);
  return new Elysia({ prefix: "/admin/map", detail: { tags: ["Admin content"] } }).use(plugins).get(
    "/overview",
    async ({ query: { west, south, east, north }, set }) => {
      if (west === undefined || south === undefined || east === undefined || north === undefined) return fail(set, 422, "validation_failed");
      const found = await getServices().mapOverview.overview({ west, south, east, north });
      return found ? { ok: true as const, ...found } : fail(set, 422, "validation_failed");
    },
    {
      auth: "route.manage",
      // Optional, checked in the handler: a required query field would answer 422 before the login check says 401.
      query: t.Object({ west: t.Optional(lng), south: t.Optional(lat), east: t.Optional(lng), north: t.Optional(lat) }),
      detail: { summary: "Every course line, waypoint and directory place in an area (the admin's one map)" },
    },
  );
}
