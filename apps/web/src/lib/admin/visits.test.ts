import { describe, expect, test } from "bun:test";
import { areaGeometry, axisTicks, barPercent, countryName, fillDays, niceMax, regionName, sharePercent, shortPath } from "./visits";

describe("visit places", () => {
  test("Japanese regions are prefectures; others keep the host's code", () => {
    expect(regionName("JP", "29")).toBe("奈良県");
    expect(regionName("JP", "01")).toBe("北海道");
    expect(regionName("JP", "47")).toBe("沖縄県");
    expect(regionName("JP", "99")).toBe("99");
    expect(regionName("US", "CA")).toBe("CA");
    expect(regionName("JP", "")).toBe("");
  });

  test("countries are named in the reader's language; unknown stays empty", () => {
    expect(countryName("JP", "en")).toBe("Japan");
    expect(countryName("JP", "ja")).toBe("日本");
    expect(countryName("", "en")).toBe("");
  });

  test("a bar is proportional and always visible", () => {
    expect(barPercent(50, 100)).toBe(50);
    expect(barPercent(1, 1000)).toBe(2);
    expect(barPercent(0, 0)).toBe(0);
  });
});

describe("the charts' numbers", () => {
  test("fillDays gives every day of the range, with 0 for a day with no views", () => {
    expect(fillDays([{ day: "2026-11-01", views: 3 }, { day: "2026-11-03", views: 5 }], "2026-10-31", "2026-11-03")).toEqual([
      { day: "2026-10-31", views: 0 },
      { day: "2026-11-01", views: 3 },
      { day: "2026-11-02", views: 0 },
      { day: "2026-11-03", views: 5 },
    ]);
    expect(fillDays([], "2026-11-05", "2026-11-04")).toEqual([]);
  });

  test("niceMax rounds up to 1, 2, 5 or 10 times a power of ten, never below 1", () => {
    expect([0, 1, 3, 7, 12, 48, 101, 487, 1458].map(niceMax)).toEqual([1, 1, 5, 10, 20, 50, 200, 500, 2000]);
  });

  test("axisTicks: whole, distinct numbers for every scale top, even a tiny one", () => {
    expect(axisTicks(1)).toEqual([1, 0]);
    expect(axisTicks(2)).toEqual([2, 1, 0]);
    expect(axisTicks(5)).toEqual([5, 4, 3, 2, 1, 0]);
    expect(axisTicks(10)).toEqual([10, 8, 6, 4, 2, 0]);
    expect(axisTicks(20)).toEqual([20, 15, 10, 5, 0]);
    for (const top of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) {
      const ticks = axisTicks(top);
      expect(new Set(ticks).size).toBe(ticks.length);
      expect(ticks.every(Number.isInteger)).toBe(true);
    }
  });

  test("shortPath shortens an id inside a path and keeps readable words", () => {
    expect(shortPath("/routes/ffb2d002-fd99-4c1b-89f1-41efacba9281")).toBe("/routes/ffb2…");
    expect(shortPath("/blog")).toBe("/blog");
    expect(shortPath("/")).toBe("/");
  });

  test("sharePercent is a whole percent of the total, 0 for an empty total, and under 1 shows as 1", () => {
    expect(sharePercent(1458, 2167)).toBe(67);
    expect(sharePercent(1, 2167)).toBe(1);
    expect(sharePercent(5, 0)).toBe(0);
  });

  test("areaGeometry draws a line through every day inside the box, and closes the area down to the floor", () => {
    const g = areaGeometry([0, 5, 10], 200, 100);
    expect(g.max).toBe(10);
    expect(g.line).toBe("M0,100 L100,50 L200,0");
    expect(g.area).toBe("M0,100 L100,50 L200,0 L200,100 L0,100 Z");
    expect(areaGeometry([4], 200, 100).line).toBe("M100,20");
    expect(areaGeometry([], 200, 100).line).toBe("");
  });
});
