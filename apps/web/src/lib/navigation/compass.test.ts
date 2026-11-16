import { expect, test } from "bun:test";
import { headingOf, smoothHeading, turnBetween } from "./compass";

test("an iPhone's compass heading is used as it is; Android's alpha counts the other way", () => {
  expect(headingOf({ webkitCompassHeading: 90 }, 0, false)).toBe(90);
  expect(headingOf({ alpha: 90 }, 0, true)).toBe(270);
  expect(headingOf({ alpha: 0 }, 0, true)).toBe(0);
});

test("a phone on its side adds the screen's turn; Android's relative alpha is not a compass", () => {
  expect(headingOf({ webkitCompassHeading: 350 }, 90, false)).toBe(80);
  expect(headingOf({ alpha: 90 }, 0, false)).toBeNull();
  expect(headingOf({}, 0, true)).toBeNull();
});

test("smoothing goes the short way round north, a share at a time", () => {
  expect(turnBetween(350, 10)).toBe(20);
  expect(turnBetween(10, 350)).toBe(-20);
  expect(smoothHeading(null, 123)).toBe(123);
  expect(smoothHeading(350, 10, 0.5)).toBe(0);
  expect(smoothHeading(0, 90, 0.5)).toBe(45);
});
