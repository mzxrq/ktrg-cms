import { expect, test } from "bun:test";
import { flightPath, flightSeconds, headingAt, heightAt, pointAt, turnToward } from "./fly-along";

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

test("a flight lasts 20 s to a minute", () => {
  expect(flightSeconds(1000)).toBe(20);
  expect(flightSeconds(8000)).toBe(40);
  expect(flightSeconds(30000)).toBe(60);
});
