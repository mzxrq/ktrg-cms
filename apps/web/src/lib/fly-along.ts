import { bearingDeg, cumulativeDistances, projectOnLine, type LatLng } from "./navigation/geometry";
import { pickText } from "./pick-text";
import { plainRich } from "./rich-text";

// The enlarged course map's fly-along (2026-11-26, user): the 3D camera follows the course from start to goal. Pure, so the
// path maths is tested; TrailMap runs it frame by frame.

export interface FlightPath {
  points: LatLng[];
  /** Distance from the start to each point, in metres. */
  cum: number[];
  total: number;
}

export function flightPath(points: readonly LatLng[]): FlightPath {
  const cum = cumulativeDistances(points.map((p) => [p.lng, p.lat] as const));
  return { points: [...points], cum, total: cum[cum.length - 1] ?? 0 };
}

/** The segment `d` metres along lies on, and how far into it (0-1). */
function segmentAt(path: FlightPath, d: number): { i: number; t: number } {
  const at = Math.min(Math.max(d, 0), path.total);
  let i = 0;
  while (i < path.cum.length - 2 && path.cum[i + 1]! < at) i++;
  const len = path.cum[i + 1]! - path.cum[i]!;
  return { i, t: len > 0 ? (at - path.cum[i]!) / len : 0 };
}

/** The place `d` metres along the course. */
export function pointAt(path: FlightPath, d: number): LatLng {
  if (path.points.length < 2) return path.points[0]!;
  const { i, t } = segmentAt(path, d);
  const a = path.points[i]!;
  const b = path.points[i + 1]!;
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** The height `d` metres along (from the line's own heights, as the elevation chart), or null where none is known. */
export function heightAt(path: FlightPath, heights: readonly (number | null)[] | null | undefined, d: number): number | null {
  if (!heights || heights.length !== path.points.length || path.points.length < 2) return null;
  const { i, t } = segmentAt(path, d);
  const a = heights[i];
  const b = heights[i + 1];
  if (a == null || b == null) return a ?? b ?? null;
  return a + (b - a) * t;
}

/** Which way the camera looks: at a point `ahead` metres further on (near the end, from as far back), so a zigzag in the
 *  track does not swing the view. */
export function headingAt(path: FlightPath, d: number, ahead = 300): number {
  const from = Math.min(d, Math.max(0, path.total - ahead));
  return bearingDeg(pointAt(path, from), pointAt(path, from + ahead));
}

/** Turns the camera part of the way (k, 0-1) from `prev` toward `target`, the short way round (359° → 1° is 2°). */
export function turnToward(prev: number, target: number, k: number): number {
  const diff = ((((target - prev) % 360) + 540) % 360) - 180;
  return (((prev + diff * k) % 360) + 360) % 360;
}

/** How long the flight takes: about 5 s a kilometre, never under 20 s or over a minute. */
export const flightSeconds = (meters: number) => Math.min(60, Math.max(20, (meters / 1000) * 5));

/** A waypoint's fly-along settings as admin set them (each null or missing: automatic). */
export interface FlySettings {
  show?: boolean | null;
  seconds?: number | null;
  photoUrl?: string | null;
  noteJa?: string | null;
  noteEn?: string | null;
}

/** What the flight shows when it stops at a waypoint. */
export interface FlyStop {
  seconds: number;
  photo: string | null;
  note: string | null;
  noteLang: "ja" | "en";
  /** A side trip or a place off the line: shown as worth a visit (寄り道におすすめ). */
  recommended: boolean;
}

// The card clamps the line to three lines (CSS line-clamp draws the ellipsis), so this only keeps the text from being huge.
const NOTE_CHARS = 300;
const shorten = (text: string) => text.slice(0, NOTE_CHARS).trimEnd();

/**
 * Whether the flight stops at a waypoint and what it shows there (null: it flies past). Automatic: it stops at stamp places
 * and side trips. The card's line is the admin's own, else the start of the description; its photo the chosen one, else
 * the main one.
 */
export function flyStopOf(
  item: { stampable: boolean; stopBy?: boolean; photoUrl?: string | null; descriptionJa?: string | null; descriptionEn?: string | null; fly?: FlySettings },
  locale: string,
): FlyStop | null {
  const fly = item.fly ?? {};
  if (!(fly.show ?? (item.stampable || item.stopBy === true))) return null;
  const own = pickText(locale, fly.noteJa ?? null, fly.noteEn ?? null);
  const description = own ? null : pickText(locale, item.descriptionJa ?? null, item.descriptionEn ?? null);
  const note = own ?? (description ? { text: shorten(plainRich(description.text).trim()), lang: description.lang } : null);
  return {
    seconds: Math.min(15, Math.max(3, fly.seconds ?? 5)),
    photo: fly.photoUrl || item.photoUrl || null,
    note: note?.text || null,
    noteLang: note?.lang ?? "ja",
    recommended: item.stopBy === true,
  };
}

/**
 * Where along the flight each stop comes, in walking order: each is matched to the line from the stop before onward, so a
 * course that comes back the same way pauses on the right pass. A place off the line pauses where the line comes closest.
 */
export function flightStops(path: FlightPath, stops: readonly { id: string; position: LatLng }[]): { id: string; d: number }[] {
  const line = path.points.map((p) => [p.lng, p.lat] as const);
  const out: { id: string; d: number }[] = [];
  let from = 0;
  for (const stop of stops) {
    const hit = projectOnLine(line, path.cum, stop.position, { fromM: from, toM: Number.POSITIVE_INFINITY });
    if (!hit) continue;
    out.push({ id: stop.id, d: hit.alongM });
    from = hit.alongM;
  }
  return out;
}
