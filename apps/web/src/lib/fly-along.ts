import { bearingDeg, cumulativeDistances, type LatLng } from "./navigation/geometry";

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
