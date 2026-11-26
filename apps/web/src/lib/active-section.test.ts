import { expect, test } from "bun:test";
import { activeSection } from "./active-section";

test("the last section whose top is above the line is the one being read", () => {
  expect(activeSection([200, 900, 1500], 60)).toBe(-1);
  expect(activeSection([-300, 40, 700], 60)).toBe(1);
  expect(activeSection([-900, -400, 60], 60)).toBe(2);
  // A missing section (Infinity) never wins.
  expect(activeSection([-100, Infinity], 60)).toBe(0);
});
