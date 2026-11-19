import { describe, expect, test } from "bun:test";
import { labelSides } from "./label-sides";

const label = (x: number, y: number) => ({ x, y, width: 100, height: 28, circle: 28 });

describe("labelSides", () => {
  test("a lone label runs to the right", () => {
    expect(labelSides([label(500, 500)])).toEqual(["right"]);
  });

  test("a label with a neighbour just to its right turns left", () => {
    expect(labelSides([label(500, 500), label(560, 500)])).toEqual(["left", "right"]);
  });

  test("labels far apart both run right", () => {
    expect(labelSides([label(100, 500), label(600, 500)])).toEqual(["right", "right"]);
  });
});
