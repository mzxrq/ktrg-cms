import { expect, test } from "bun:test";
import { lineNoLongerChecked, onGlobe } from "./save-plan";

const leg = { from: "a", to: "b", points: [] };
const at = { lat: 34, lng: 135 };

test("moving a stop a checked line runs to takes the check off; anything else keeps it", () => {
  expect(lineNoLongerChecked({ lineVerified: true, legs: [leg] }, "a", at, { lat: 34.001, lng: 135 })).toBe(true);
  expect(lineNoLongerChecked({ lineVerified: true, legs: [leg] }, "a", at, at)).toBe(false); // not moved
  expect(lineNoLongerChecked({ lineVerified: false, legs: [leg] }, "a", at, { lat: 34.001, lng: 135 })).toBe(false); // not checked anyway
  expect(lineNoLongerChecked({ lineVerified: true, legs: [leg] }, "c", at, { lat: 34.001, lng: 135 })).toBe(false); // no line to it
});

test("a latitude and longitude typed the wrong way round is a position to fix, not a save that fails", () => {
  expect(onGlobe({ lat: 34.5, lng: 135.7 })).toBe(true);
  expect(onGlobe({ lat: 135.7, lng: 34.5 })).toBe(false);
  expect(onGlobe({ lat: null, lng: null })).toBe(true);
  expect(onGlobe({ lat: 34, lng: 190 })).toBe(false);
});
