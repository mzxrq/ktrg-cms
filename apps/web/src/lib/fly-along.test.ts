import { expect, test } from "bun:test";
import { flightPath, flightSeconds, flightStops, flyStopOf, headingAt, heightAt, pointAt, turnToward } from "./fly-along";

// Due east along the equator: 0.01° of longitude is about 1113 m.
const path = flightPath([
  { lat: 0, lng: 0 },
  { lat: 0, lng: 0.01 },
  { lat: 0, lng: 0.02 },
]);

test("a point part of the way along lies on the line", () => {
  expect(path.total).toBeCloseTo(2226, -1);
  expect(pointAt(path, 0)).toEqual({ lat: 0, lng: 0 });
  expect(pointAt(path, path.total / 4).lng).toBeCloseTo(0.005, 4);
  expect(pointAt(path, path.total).lng).toBeCloseTo(0.02, 6);
  // Past either end it stays at the end.
  expect(pointAt(path, -50).lng).toBe(0);
  expect(pointAt(path, path.total + 50).lng).toBeCloseTo(0.02, 6);
});

test("the height comes from the line's own heights, and is null without them", () => {
  expect(heightAt(path, [100, 200, 300], path.total / 4)).toBeCloseTo(150, 0);
  expect(heightAt(path, [100, null, 300], path.total / 4)).toBe(100);
  expect(heightAt(path, null, 10)).toBeNull();
  expect(heightAt(path, [1, 2], 10)).toBeNull(); // not one height per point
});

test("the camera looks ahead along the line, also at the very end", () => {
  expect(headingAt(path, 0)).toBeCloseTo(90, 0);
  expect(headingAt(path, path.total)).toBeCloseTo(90, 0);
});

test("the camera turns the short way round", () => {
  expect(turnToward(359, 1, 0.5)).toBeCloseTo(0, 6);
  expect(turnToward(10, 350, 1)).toBeCloseTo(350, 6);
  expect(turnToward(90, 90, 0.3)).toBeCloseTo(90, 6);
});

test("automatic: the flight stops at stamp places and side trips, not at a toilet; admin can turn any on or off", () => {
  expect(flyStopOf({ stampable: true }, "ja")).not.toBeNull();
  expect(flyStopOf({ stampable: false, stopBy: true }, "ja")?.recommended).toBe(true);
  expect(flyStopOf({ stampable: false }, "ja")).toBeNull();
  expect(flyStopOf({ stampable: false, fly: { show: true } }, "ja")).not.toBeNull();
  expect(flyStopOf({ stampable: true, fly: { show: false } }, "ja")).toBeNull();
});

test("the card shows the admin's line and photo, else the start of the description and the main photo", () => {
  const item = { stampable: true, photoUrl: "https://x/main.jpg", descriptionJa: "**大きな**楠があります。".repeat(10), descriptionEn: null };
  const auto = flyStopOf(item, "en")!;
  expect(auto).toMatchObject({ seconds: 5, photo: "https://x/main.jpg", noteLang: "ja" });
  expect(auto.note!.startsWith("大きな楠があります。")).toBe(true);
  expect(auto.note!.endsWith("…")).toBe(true);
  const own = flyStopOf({ ...item, fly: { seconds: 40, photoUrl: "https://x/2.jpg", noteJa: "急な登り", noteEn: "Steep climb" } }, "en")!;
  expect(own).toMatchObject({ seconds: 15, photo: "https://x/2.jpg", note: "Steep climb", noteLang: "en" });
});

test("stops are placed along the flight in walking order, also on a course that comes back the same way", () => {
  const there = flightPath([
    { lat: 0, lng: 0 },
    { lat: 0, lng: 0.02 },
    { lat: 0, lng: 0 },
  ]);
  const at = flightStops(there, [
    { id: "a", position: { lat: 0, lng: 0.01 } },
    { id: "far", position: { lat: 0.001, lng: 0.02 } },
    { id: "b", position: { lat: 0, lng: 0.01 } },
  ]);
  expect(at.map((s) => s.id)).toEqual(["a", "far", "b"]);
  expect(at[0]!.d).toBeCloseTo(1113, -1);
  expect(at[2]!.d).toBeCloseTo(3339, -1); // the way back, not the way out
});

test("a flight lasts 20 s to a minute", () => {
  expect(flightSeconds(1000)).toBe(20);
  expect(flightSeconds(8000)).toBe(40);
  expect(flightSeconds(30000)).toBe(60);
});
