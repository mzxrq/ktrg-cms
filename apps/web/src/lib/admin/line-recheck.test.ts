import { expect, test } from "bun:test";
import { lineNoLongerChecked } from "./save-plan";

const leg = { from: "a", to: "b", points: [] };
const at = { lat: 34, lng: 135 };

test("moving a stop a checked line runs to takes the check off; anything else keeps it", () => {
  expect(lineNoLongerChecked({ lineVerified: true, legs: [leg] }, "a", at, { lat: 34.001, lng: 135 })).toBe(true);
  expect(lineNoLongerChecked({ lineVerified: true, legs: [leg] }, "a", at, at)).toBe(false); // not moved
  expect(lineNoLongerChecked({ lineVerified: false, legs: [leg] }, "a", at, { lat: 34.001, lng: 135 })).toBe(false); // not checked anyway
  expect(lineNoLongerChecked({ lineVerified: true, legs: [leg] }, "c", at, { lat: 34.001, lng: 135 })).toBe(false); // no line to it
});
