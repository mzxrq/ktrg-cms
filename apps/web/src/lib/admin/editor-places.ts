import type { EditorPlace } from "@/components/admin/map-editor/MapEditor";
import type { StopRole } from "@/lib/route-stops";
import type { RouteDraft } from "./route-draft";

/**
 * A course's waypoints as the map editor draws them: the numbers are the stamp numbers visitors see (a waypoint without a
 * stamp has none), and the start and goal by the same rule as the public map (a round trip or an out-and-back has one
 * place that is both). Shared by the course editor and the one map, so a pin looks the same on both.
 */
export function editorPlacesOf(draft: Pick<RouteDraft, "places" | "walkStyle">): EditorPlace[] {
  let stamp = 0;
  const comesBack = draft.walkStyle === "loop" || draft.walkStyle === "out_and_back";
  const along = draft.places.filter((p) => !p.stopBy && p.lat !== null && p.lng !== null);
  const roleOf = (key: string): StopRole | undefined =>
    key === along[0]?.key ? (comesBack ? "both" : "start") : !comesBack && along.length > 1 && key === along.at(-1)!.key ? "goal" : undefined;
  return draft.places.map((p) => ({ key: p.key, lat: p.lat, lng: p.lng, number: p.stampable ? ++stamp : null, name: p.nameJa, stampable: p.stampable, stopBy: p.stopBy, detached: p.detached, kind: p.kind, published: p.published, role: roleOf(p.key), info: p.status === "info" }));
}
