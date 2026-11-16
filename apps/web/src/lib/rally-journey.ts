// What a visitor who has not started a rally wants to know first: how big the walk is. Pure functions, unit-tested; the
// numbers come from the courses the rally runs through (the rally record itself holds none).

import type { RallyItem } from "./rally-model";

/** The parts of a course the journey needs (a RouteSummary has them all). */
export interface JourneyRoute {
  id: string;
  distanceKm: number | null;
  expectedTimeMin: number | null;
  photoUrl: string | null;
  photoCredit?: string | null;
}

export interface JourneyFacts {
  /** How many stamp places. */
  places: number;
  /** The trail length of the courses, to a tenth of a kilometre; null when no course says. */
  km: number | null;
  /** The walking time, to the nearest five minutes; null when no course says. */
  minutes: number | null;
  /** A photo of the first course that has one. */
  photoUrl: string | null;
  photoCredit: string | null;
}

const sum = (values: readonly (number | null)[]): number | null => {
  const known = values.filter((v): v is number => v !== null);
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0);
};

/** The size of the walk, from the courses the rally runs through. A course the data does not know yet adds nothing. */
export function journeyFacts(rally: Pick<RallyItem, "total" | "routeIds">, routes: readonly JourneyRoute[]): JourneyFacts {
  const mine = rally.routeIds.flatMap((id) => routes.find((r) => r.id === id) ?? []);
  const km = sum(mine.map((r) => r.distanceKm));
  const min = sum(mine.map((r) => r.expectedTimeMin));
  const withPhoto = mine.find((r) => r.photoUrl);
  return {
    places: rally.total,
    km: km === null ? null : Math.round(km * 10) / 10,
    minutes: min === null ? null : Math.round(min / 5) * 5,
    photoUrl: withPhoto?.photoUrl ?? null,
    photoCredit: withPhoto?.photoCredit ?? null,
  };
}

/** A walking time in whole hours and minutes ("2 h 30 min"). */
export function walkTime(minutes: number): { hours: number; minutes: number } {
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}
