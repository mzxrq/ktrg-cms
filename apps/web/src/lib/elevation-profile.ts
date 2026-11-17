// The elevation profile of a route line, as pure functions: distance along the line, smoothed elevations, the slope of
// each stretch and its heat colour, totals. Ported from Navivi (src/utils/elevation.ts), which draws the same graph.
// No React, no browser, no network, so it is unit-tested.

import { distanceM, type LatLng } from "./navigation/geometry";

export type MaybeEle = number | null | undefined;

/** A stretch that is ridden, not walked (a ferry across the water ...): where it starts and ends along the line. */
export interface RideSpan {
  from: LatLng;
  to: LatLng;
  mode: "ferry" | "bus" | "train" | "other";
}

/** Recorded elevation is only good to a few metres, so it is averaged over this distance before use. */
export const SMOOTH_WINDOW_M = 60;
/** A slope is measured over at least this far, so two close points with a 1 m reading gap do not become a wall. */
export const SLOPE_SPAN_M = 60;
export const SLOPE_CAP_PCT = 40;
/** At most this many points are drawn, however long the line. */
export const MAX_POINTS = 300;

/** The heat ramp (percent slope to colour): blue downhill, green flat, red uphill. Also the legend. */
export const GRADIENT_STOPS: readonly { pct: number; color: string }[] = [
  { pct: -10, color: "#2563eb" },
  { pct: -5, color: "#06b6d4" },
  { pct: 0, color: "#10b981" },
  { pct: 5, color: "#f97316" },
  { pct: 10, color: "#ef4444" },
];

const hexToRgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

export function gradientColor(pct: number | null | undefined, fallback = "#3b82f6"): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return fallback;
  const first = GRADIENT_STOPS[0]!;
  const last = GRADIENT_STOPS[GRADIENT_STOPS.length - 1]!;
  if (pct <= first.pct) return first.color;
  if (pct >= last.pct) return last.color;
  for (let i = 1; i < GRADIENT_STOPS.length; i++) {
    const hi = GRADIENT_STOPS[i]!;
    if (pct > hi.pct) continue;
    const lo = GRADIENT_STOPS[i - 1]!;
    const f = (pct - lo.pct) / (hi.pct - lo.pct);
    const a = hexToRgb(lo.color);
    const b = hexToRgb(hi.color);
    return "#" + a.map((v, k) => Math.round(v + (b[k]! - v) * f).toString(16).padStart(2, "0")).join("");
  }
  return last.color;
}

/** Fills unknown values: linear between known neighbours, flat beyond the ends. Null when nothing is known. */
export function fillGaps(ele: readonly MaybeEle[]): number[] | null {
  const known = ele.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));
  const idx = known.flatMap((v, i) => (v === null ? [] : [i]));
  if (idx.length === 0) return null;
  const out: number[] = new Array(ele.length);
  let k = 0;
  for (let i = 0; i < ele.length; i++) {
    if (known[i] !== null) {
      out[i] = known[i] as number;
      continue;
    }
    while (k < idx.length && idx[k]! < i) k++;
    const next = idx[k];
    const prev = idx[k - 1];
    if (prev === undefined) out[i] = known[next!] as number;
    else if (next === undefined) out[i] = known[prev] as number;
    else out[i] = (known[prev] as number) + (((known[next] as number) - (known[prev] as number)) * (i - prev)) / (next - prev);
  }
  return out;
}

/** Moving average over a distance window. The window shrinks toward the ends so they are not flattened. */
export function smoothElevations(dist: readonly number[], ele: readonly number[], windowM = SMOOTH_WINDOW_M): number[] {
  if (ele.length < 3 || windowM <= 0) return ele.slice();
  const half = windowM / 2;
  const out: number[] = new Array(ele.length);
  let lo = 0;
  let hi = 0;
  let sum = 0;
  const end = dist[ele.length - 1]!;
  for (let i = 0; i < ele.length; i++) {
    const w = Math.min(half, dist[i]! - dist[0]!, end - dist[i]!);
    while (hi < ele.length && dist[hi]! <= dist[i]! + w) sum += ele[hi++]!;
    while (lo < ele.length && dist[lo]! < dist[i]! - w) sum -= ele[lo++]!;
    out[i] = sum / (hi - lo);
  }
  return out;
}

/** Percent slope of each segment (point i to i+1), measured over at least `spanM` metres and capped. */
export function segmentGradients(dist: readonly number[], ele: readonly number[], spanM = SLOPE_SPAN_M): number[] {
  const n = ele.length;
  const out: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    let a = i;
    let b = i + 1;
    while (dist[b]! - dist[a]! < spanM && (a > 0 || b < n - 1)) {
      if (a > 0) a--;
      if (dist[b]! - dist[a]! >= spanM) break;
      if (b < n - 1) b++;
    }
    const run = dist[b]! - dist[a]!;
    const pct = run > 0 ? ((ele[b]! - ele[a]!) / run) * 100 : 0;
    out.push(Math.max(-SLOPE_CAP_PCT, Math.min(SLOPE_CAP_PCT, pct)));
  }
  return out;
}

export interface Profile {
  /** Metres from the start, one per drawn point. */
  dist: number[];
  /** Smoothed elevation in metres, one per drawn point. */
  ele: number[];
  /** Where each drawn point is, so a hover can be shown on the map. */
  points: LatLng[];
  /** Percent slope of each stretch between drawn points (one fewer than points). */
  slopes: number[];
  totalM: number;
  min: number;
  max: number;
  /** Total climb and descent in metres, from the smoothed elevations, of the walked parts only. */
  gain: number;
  loss: number;
  /** The ridden stretches, in metres along the line: no height is drawn or read there. */
  rides: { from: number; to: number; mode: RideSpan["mode"] }[];
}

/** The index of the line point nearest to `p`, searching from `start` on. */
function nearestPoint(line: readonly LatLng[], p: LatLng, start: number): number {
  let best = start;
  let bestD = Infinity;
  for (let i = start; i < line.length; i++) {
    const d = distanceM(line[i]!, p);
    if (d < bestD) [best, bestD] = [i, d];
  }
  return best;
}

/** Where each ride lies on the line, as point indices (rides taken in order along the line; one that does not fit is dropped). */
function rideIndexes(line: readonly LatLng[], rides: readonly RideSpan[]): { i0: number; i1: number; mode: RideSpan["mode"] }[] {
  const out: { i0: number; i1: number; mode: RideSpan["mode"] }[] = [];
  let from = 0;
  for (const r of rides) {
    const i0 = nearestPoint(line, r.from, from);
    const i1 = nearestPoint(line, r.to, i0);
    if (i1 <= i0) continue;
    out.push({ i0, i1, mode: r.mode });
    from = i1;
  }
  return out;
}

/**
 * The profile of a line: `ele[i]` is the elevation of `line[i]` (null where unknown, filled between its neighbours).
 * A ridden stretch (`rides`) has no height of its own: what the line carries there (often about 0 m over the sea) is
 * dropped, and its climb is not counted. Null when the line has fewer than two points or no elevation at all.
 */
export function buildProfile(line: readonly LatLng[], ele: readonly MaybeEle[], maxPoints = MAX_POINTS, rides: readonly RideSpan[] = []): Profile | null {
  if (line.length < 2 || line.length !== ele.length) return null;
  const spans = rideIndexes(line, rides);
  const ridden = (i: number) => spans.some((s) => i > s.i0 && i < s.i1); // a point inside a ride (its ends are on land)
  const filled = fillGaps(ele.map((v, i) => (ridden(i) ? null : v)));
  if (!filled) return null;
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1]! + distanceM(line[i - 1]!, line[i]!));
  const smooth = smoothElevations(cum, filled);

  let gain = 0;
  let loss = 0;
  for (let i = 1; i < smooth.length; i++) {
    if (spans.some((s) => i > s.i0 && i <= s.i1)) continue; // the segment i-1 → i is ridden
    const d = smooth[i]! - smooth[i - 1]!;
    if (d > 0) gain += d;
    else loss -= d;
  }

  // Drawn points: every step-th, always the last, and the ends of each ride (so its band starts and stops where it does).
  const step = Math.max(1, Math.ceil(line.length / maxPoints));
  const picked = new Set<number>();
  for (let i = 0; i < line.length; i += step) picked.add(i);
  picked.add(line.length - 1);
  for (const s of spans) picked.add(s.i0).add(s.i1);
  const keep = [...picked].sort((a, b) => a - b);
  const dist = keep.map((i) => cum[i]!);
  const e = keep.map((i) => smooth[i]!);
  const walkedE = keep.flatMap((i, k) => (ridden(i) ? [] : [e[k]!]));
  const range = walkedE.length > 0 ? walkedE : e;
  return {
    dist,
    ele: e,
    points: keep.map((i) => line[i]!),
    slopes: segmentGradients(dist, e),
    totalM: cum[cum.length - 1]!,
    min: Math.min(...range),
    max: Math.max(...range),
    gain,
    loss,
    rides: spans.map((s) => ({ from: cum[s.i0]!, to: cum[s.i1]!, mode: s.mode })),
  };
}

/** The ride the point at `meters` along the line is on, if any (its ends count as walked). */
export const rideAt = (rides: Profile["rides"], meters: number): RideSpan["mode"] | null => rides.find((r) => meters > r.from && meters < r.to)?.mode ?? null;

/** The index of the drawn point nearest to `meters` along the line (binary search). */
export function nearestIndex(dist: readonly number[], meters: number): number {
  let lo = 0;
  let hi = dist.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (dist[mid]! < meters) lo = mid;
    else hi = mid;
  }
  return Math.abs(dist[lo]! - meters) <= Math.abs(dist[hi]! - meters) ? lo : hi;
}
