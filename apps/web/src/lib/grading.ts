// The mountain-grading levels shown on a route, after Nagano Prefecture's 信州 山のグレーディング: a physical level (体力度,
// 1 to 10) and a technical level (技術度, A to E). The physical level is worked out from the "course constant" (コース定数);
// the technical level is a judgement about the ground and is chosen by hand. Pure, so it can be tested and used by the
// editor and the pages alike. The descriptions are our own words, not the prefecture's text.

export const TECHNICAL_LEVELS = ["A", "B", "C", "D", "E"] as const;
export type TechnicalLevel = (typeof TECHNICAL_LEVELS)[number];

export const isTechnicalLevel = (v: unknown): v is TechnicalLevel => typeof v === "string" && (TECHNICAL_LEVELS as readonly string[]).includes(v);

/**
 * The course constant: 1.8 × hours + 0.3 × km + 10.0 × climb (km) + 0.6 × descent (km). The fixed numbers weigh the
 * time on foot, the distance and the height gained and lost; multiplied by body and pack weight it is the energy used.
 */
export function courseConstant(input: { hours: number; km: number; climbM: number; descentM: number }): number {
  return 1.8 * input.hours + 0.3 * input.km + 10.0 * (input.climbM / 1000) + 0.6 * (input.descentM / 1000);
}

/**
 * The top of each physical level's range of course constants, level 1 first; above the last it is level 10.
 * TODO(confirm): the ranges here are steps of 10; check them against the prefecture's published table before relying on
 * the suggested level (the editor only suggests it, an editor chooses the saved level).
 */
export const PHYSICAL_LEVEL_UPPER_BOUNDS = [10, 20, 30, 40, 50, 60, 70, 80, 90] as const;

export function physicalLevelOf(constant: number): number {
  const i = PHYSICAL_LEVEL_UPPER_BOUNDS.findIndex((upper) => constant <= upper);
  return i === -1 ? 10 : i + 1;
}

/** The suggested physical level for a route, or null while the distance or the time is missing. A missing climb or descent counts as flat. */
export function suggestPhysicalLevel(route: {
  distanceKm: number | null;
  expectedTimeMin: number | null;
  elevationGainM: number | null;
  descentM: number | null;
}): { constant: number; level: number } | null {
  if (route.distanceKm === null || route.expectedTimeMin === null) return null;
  const constant = courseConstant({
    hours: route.expectedTimeMin / 60,
    km: route.distanceKm,
    climbM: route.elevationGainM ?? 0,
    descentM: route.descentM ?? 0,
  });
  return { constant, level: physicalLevelOf(constant) };
}

/**
 * The levels as stars for visitors (2026-11-16, user's manager: a letter like D reads as "dangerous" and puts people off;
 * five stars read faster). Physical 1-10 -> 1-5 stars (two levels a star); technical A-E -> 1-5. The levels stay as saved.
 */
export const STAR_COUNT = 5;
export const physicalStars = (level: number): number => Math.min(STAR_COUNT, Math.max(1, Math.ceil(level / 2)));
export const technicalStars = (level: TechnicalLevel): number => TECHNICAL_LEVELS.indexOf(level) + 1;
