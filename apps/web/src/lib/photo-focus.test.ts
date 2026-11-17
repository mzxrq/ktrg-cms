import { expect, test } from "bun:test";
import { focusAt, focusFromApi, focusStyle } from "./photo-focus";

test("the pair from the API: both numbers or nothing", () => {
  expect(focusFromApi(30, 70)).toEqual({ x: 30, y: 70 });
  expect(focusFromApi(0, 0)).toEqual({ x: 0, y: 0 });
  expect(focusFromApi(null, null)).toBeNull();
  expect(focusFromApi(30, undefined)).toBeNull();
});

test("the style: object-position in percent, nothing when unset", () => {
  expect(focusStyle({ x: 30, y: 70 })).toEqual({ objectPosition: "30% 70%" });
  expect(focusStyle(null)).toBeUndefined();
});

test("a tap is read as whole percents inside the box, clamped to its edges", () => {
  const box = { left: 100, top: 50, width: 200, height: 100 };
  expect(focusAt(200, 100, box)).toEqual({ x: 50, y: 50 });
  expect(focusAt(150, 75, box)).toEqual({ x: 25, y: 25 });
  expect(focusAt(0, 999, box)).toEqual({ x: 0, y: 100 });
  expect(focusAt(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 50, y: 50 });
});
