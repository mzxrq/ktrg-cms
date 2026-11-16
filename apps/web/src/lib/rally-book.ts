// The book page of a place on a rally: everything it shows, worked out on the server so the browser only flips between
// ready pages. Pure and unit-tested. Distances are straight lines between positions a person has checked, never invented.

import { distanceMeters, type Coord } from "./places";
import { trailStops, type TrailPlace, type TrailState } from "./rally-trail";

/** A toilet is only worth naming when it is within this many metres in a straight line. */
export const TOILET_REACH_M = 2000;

export interface ToiletPlace {
  id: string;
  category: string;
  nameJa: string;
  nameEn: string | null;
  hoursJa: string | null;
  hoursEn: string | null;
  lat: number;
  lng: number;
}

export interface BookPlace extends TrailPlace {
  routeId: string;
  nameKana: string | null;
  historyJa: string | null;
  historyEn: string | null;
  statusNoteJa: string | null;
  statusNoteEn: string | null;
  lat: number | null;
  lng: number | null;
}

export interface BookInput {
  places: readonly BookPlace[];
  held: ReadonlySet<string>;
  /** When each place was stamped (ISO), by place id. */
  stampedAt: ReadonlyMap<string, string>;
  routes: readonly { routeId: string; accessJa: string | null; accessEn: string | null }[];
  toilets: readonly ToiletPlace[];
}

export interface BookPage extends BookPlace {
  number: number | null;
  state: TrailState;
  stampedAt: string | null;
  /** The next place that offers a stamp, with the straight-line distance to it. */
  next: { nameJa: string; nameEn: string | null; meters: number } | null;
  accessJa: string | null;
  accessEn: string | null;
  toilet: { nameJa: string; nameEn: string | null; hoursJa: string | null; hoursEn: string | null; meters: number } | null;
}

/** The nearest toilet to a position, within reach; null when there is none or the position is not known. */
export function nearestToilet(from: Coord | null, toilets: readonly ToiletPlace[]): { place: ToiletPlace; meters: number } | null {
  if (!from) return null;
  let best: { place: ToiletPlace; meters: number } | null = null;
  for (const place of toilets) {
    if (place.category !== "toilet") continue;
    const meters = distanceMeters(from, place);
    if (meters <= TOILET_REACH_M && (!best || meters < best.meters)) best = { place, meters };
  }
  return best;
}

const coordOf = (p: { lat: number | null; lng: number | null }): Coord | null => (p.lat !== null && p.lng !== null ? { lat: p.lat, lng: p.lng } : null);

/** One page for each place, in the rally's order. */
export function bookPages(input: BookInput): BookPage[] {
  const stops = trailStops(input.places, input.held);
  return input.places.map((place, i) => {
    const stop = stops[i]!;
    const from = coordOf(place);
    const following = input.places.slice(i + 1).find((p) => p.status !== "info");
    const to = following ? coordOf(following) : null;
    const toilet = nearestToilet(from, input.toilets);
    const access = input.routes.find((r) => r.routeId === place.routeId);
    return {
      ...place,
      number: stop.number,
      state: stop.state,
      stampedAt: input.stampedAt.get(place.id) ?? null,
      next: following && from && to ? { nameJa: following.nameJa, nameEn: following.nameEn, meters: distanceMeters(from, to) } : null,
      accessJa: access?.accessJa ?? null,
      accessEn: access?.accessEn ?? null,
      toilet: toilet ? { nameJa: toilet.place.nameJa, nameEn: toilet.place.nameEn, hoursJa: toilet.place.hoursJa, hoursEn: toilet.place.hoursEn, meters: toilet.meters } : null,
    };
  });
}

/** Where the open book page goes on a wide screen: the right column, under the stamps (the rally page places it; RallyBook fills it). */
export const BOOK_SIDE_ID = "rally-book-side";
