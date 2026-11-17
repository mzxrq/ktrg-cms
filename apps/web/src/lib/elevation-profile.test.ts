import { describe, expect, test } from "bun:test";
import { buildProfile, fillGaps, gradientColor, GRADIENT_STOPS, nearestIndex, rideAt, segmentGradients, smoothElevations } from "./elevation-profile";

// East along latitude 34.5; 0.001 degrees of longitude is about 92 m.
const along = (n: number, lngStep = 0.001) => Array.from({ length: n }, (_, i) => ({ lat: 34.5, lng: 135 + i * lngStep }));

describe("gradientColor", () => {
  test("the stops are their own colours, the ends clamp, nothing known is the fallback", () => {
    for (const s of GRADIENT_STOPS) expect(gradientColor(s.pct)).toBe(s.color);
    expect(gradientColor(-50)).toBe(GRADIENT_STOPS[0]!.color);
    expect(gradientColor(50)).toBe(GRADIENT_STOPS.at(-1)!.color);
    expect(gradientColor(null)).toBe("#3b82f6");
    expect(gradientColor(2.5)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("fillGaps and smoothing", () => {
  test("gaps are filled between neighbours and flat beyond the ends; nothing known is null", () => {
    expect(fillGaps([null, 10, undefined, 30, null])).toEqual([10, 10, 20, 30, 30]);
    expect(fillGaps([null, undefined])).toBeNull();
  });

  test("a one-point spike is flattened but the ends stay", () => {
    const dist = [0, 30, 60, 90, 120];
    const s = smoothElevations(dist, [0, 0, 100, 0, 0]);
    expect(Math.max(...s)).toBeLessThan(100);
    expect(s[0]).toBe(0);
    expect(s.at(-1)).toBe(0);
  });

  test("slopes: 10% up reads about +10, and a two-metre blip over a short step is not a wall", () => {
    const dist = [0, 100, 200, 300];
    expect(segmentGradients(dist, [0, 10, 20, 30])[1]).toBeCloseTo(10, 0);
    expect(Math.abs(segmentGradients([0, 5, 10, 200], [0, 2, 0, 0])[0]!)).toBeLessThan(10);
  });
});

describe("buildProfile", () => {
  test("x is real distance, so unevenly spaced points are not stretched evenly", () => {
    const line = [{ lat: 34.5, lng: 135 }, { lat: 34.5, lng: 135.001 }, { lat: 34.5, lng: 135.01 }];
    const p = buildProfile(line, [0, 10, 100], 300)!;
    expect(p.dist[1]! / p.totalM).toBeLessThan(0.15); // the second point is a tenth of the way, not half
  });

  test("totals, range and the climb of a straight ramp", () => {
    const line = along(30);
    const p = buildProfile(line, line.map((_, i) => i * 5))!;
    expect(p.totalM).toBeGreaterThan(2500);
    expect(p.min).toBeCloseTo(0, 0);
    expect(p.max).toBeCloseTo(145, 0);
    expect(p.gain).toBeGreaterThan(140);
    expect(p.loss).toBeLessThan(1);
    expect(p.slopes.length).toBe(p.dist.length - 1);
  });

  test("a long line is cut to the point limit but keeps its last point", () => {
    const line = along(2000, 0.0001);
    const p = buildProfile(line, line.map((_, i) => Math.sin(i / 50) * 50), 300)!;
    expect(p.dist.length).toBeLessThanOrEqual(301);
    expect(p.points.at(-1)).toEqual(line.at(-1)!);
  });

  describe("a ferry across the water", () => {
    // Walk up from 50 m to 150 m (points 0-10), ride from 10 to 30 over the sea, walk up again to 200 m (30-39).
    const line = along(40);
    const heights = (sea: number | null) => line.map((_, i) => (i <= 10 ? 50 + i * 10 : i < 30 ? sea : 150 + (i - 30) * (50 / 9)));
    const ferry = [{ from: line[10]!, to: line[30]!, mode: "ferry" as const }];

    for (const [name, sea] of [["no height over the sea", null], ["a track that reads about 0 m over the sea", 0]] as const) {
      test(`${name}: the crossing is left out of the climb and the range`, () => {
        const p = buildProfile(line, heights(sea), 300, ferry)!;
        expect(p.rides).toHaveLength(1);
        expect(p.rides[0]!.mode).toBe("ferry");
        expect(p.gain).toBeGreaterThan(140);
        expect(p.gain).toBeLessThan(160);
        expect(p.loss).toBeLessThan(5);
        expect(p.min).toBeGreaterThan(40); // not pulled down to the sea
        const mid = (p.rides[0]!.from + p.rides[0]!.to) / 2;
        expect(rideAt(p.rides, mid)).toBe("ferry");
        expect(rideAt(p.rides, p.rides[0]!.from)).toBeNull(); // the port itself is walked
        expect(p.dist).toContain(p.rides[0]!.from); // the band starts at a drawn point
        expect(p.dist).toContain(p.rides[0]!.to);
      });
    }

    test("without the ride mark, the 0 m crossing is counted as walked (nothing else can tell)", () => {
      const p = buildProfile(line, heights(0), 300)!;
      expect(p.rides).toEqual([]);
      expect(p.loss).toBeGreaterThan(100);
    });
  });

  test("no elevation, a mismatched or tiny line: null", () => {
    expect(buildProfile(along(5), [null, null, null, null, null])).toBeNull();
    expect(buildProfile(along(5), [1, 2])).toBeNull();
    expect(buildProfile(along(1), [1])).toBeNull();
  });
});

test("nearestIndex finds the closest drawn point", () => {
  const d = [0, 100, 250, 400];
  expect([nearestIndex(d, -5), nearestIndex(d, 90), nearestIndex(d, 200), nearestIndex(d, 999)]).toEqual([0, 1, 2, 3]);
});
