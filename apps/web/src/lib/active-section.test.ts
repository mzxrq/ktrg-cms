import { expect, test } from "bun:test";
import { activeSection, readingLine } from "./active-section";

test("the lowest section whose top has reached the line is the one being read", () => {
  expect(activeSection([200, 900, 1500], 60)).toBe(-1);
  expect(activeSection([-300, 40, 700], 60)).toBe(1);
  expect(activeSection([-900, -400, 60], 60)).toBe(2);
  // A missing section (Infinity) never wins.
  expect(activeSection([-100, Infinity], 60)).toBe(0);
  // By position, not list order (the page reorders its sections with CSS).
  expect(activeSection([40, -500, 900], 60)).toBe(0);
});

test("a section a jump has just brought under the bar (80 px down) counts at once", () => {
  const line = readingLine(56, 852);
  expect(activeSection([-600, 80, 900], line)).toBe(1);
});
