// The rally page's trail: the places in order, each stamped, next or still to do, and where the walker stands. Pure and
// unit-tested; the page and (later) the book page read the same answer so they never disagree.

export interface TrailPlace {
  id: string;
  status: "open" | "caution" | "closed" | "info";
  nameJa: string;
  nameEn: string | null;
  photoUrl: string | null;
  descriptionJa: string | null;
  descriptionEn: string | null;
}

export type TrailState = "stamped" | "next" | "todo" | "info";

export interface TrailStop extends TrailPlace {
  /** 1, 2, 3 ... among the places that offer a stamp; null for a place that does not. */
  number: number | null;
  state: TrailState;
}

/**
 * The places as trail stops. A closed place counts as done (the rally rule), a place that offers no stamp (`info`) is
 * shown but never numbered, never next. The first place not done is `next`.
 */
export function trailStops(places: readonly TrailPlace[], held: ReadonlySet<string>): TrailStop[] {
  let number = 0;
  let nextTaken = false;
  return places.map((p) => {
    if (p.status === "info") return { ...p, number: null, state: "info" };
    number += 1;
    if (held.has(p.id) || p.status === "closed") return { ...p, number, state: "stamped" };
    if (!nextTaken) {
      nextTaken = true;
      return { ...p, number, state: "next" };
    }
    return { ...p, number, state: "todo" };
  });
}

/** The index of the stop the walker stands at: the next one, else the last one stamped, else the first (0 for none). */
export function walkerAt(stops: readonly TrailStop[]): number {
  const next = stops.findIndex((s) => s.state === "next");
  if (next >= 0) return next;
  const lastDone = stops.map((s) => s.state).lastIndexOf("stamped");
  return Math.max(0, lastDone);
}
