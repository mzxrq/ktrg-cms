import { describe, expect, test } from "bun:test";
import { trailStops, walkerAt, type TrailPlace } from "./rally-trail";

const place = (id: string, status: TrailPlace["status"] = "open"): TrailPlace => ({ id, status, nameJa: id, nameEn: null, photoUrl: null, descriptionJa: null, descriptionEn: null });

describe("trailStops", () => {
  test("marks stamped places, the first one not yet stamped as next, and the rest as todo", () => {
    const stops = trailStops([place("a"), place("b"), place("c"), place("d")], new Set(["a", "b"]));
    expect(stops.map((s) => [s.number, s.state])).toEqual([[1, "stamped"], [2, "stamped"], [3, "next"], [4, "todo"]]);
  });

  test("nothing stamped: the first place is next", () => {
    expect(trailStops([place("a"), place("b")], new Set()).map((s) => s.state)).toEqual(["next", "todo"]);
  });

  test("a place that offers no stamp is info: never next, never numbered", () => {
    const stops = trailStops([place("a"), place("i", "info"), place("b")], new Set(["a"]));
    expect(stops.map((s) => [s.number, s.state])).toEqual([[1, "stamped"], [null, "info"], [2, "next"]]);
  });

  test("a closed place counts as done, so the walker moves past it", () => {
    const stops = trailStops([place("a", "closed"), place("b")], new Set());
    expect(stops.map((s) => s.state)).toEqual(["stamped", "next"]);
  });

  test("everything stamped: no next", () => {
    expect(trailStops([place("a"), place("b")], new Set(["a", "b"])).map((s) => s.state)).toEqual(["stamped", "stamped"]);
  });
});

describe("walkerAt", () => {
  test("stands at the next place; at the last stamped one when all are done; at the first when there are none", () => {
    const part = trailStops([place("a"), place("b"), place("c")], new Set(["a"]));
    expect(walkerAt(part)).toBe(1);
    expect(walkerAt(trailStops([place("a"), place("b")], new Set(["a", "b"])))).toBe(1);
    expect(walkerAt([])).toBe(0);
  });

  test("an info place is never where the walker stands", () => {
    expect(walkerAt(trailStops([place("a"), place("i", "info")], new Set(["a"])))).toBe(0);
  });
});
