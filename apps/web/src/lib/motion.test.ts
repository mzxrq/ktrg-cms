import { describe, expect, test } from "bun:test";
import { levelFor } from "./motion";

describe("levelFor", () => {
  test("nothing set: full", () => expect(levelFor(false, false, false)).toBe("full"));
  test("the visitor's Fade only: fade", () => expect(levelFor(false, true, false)).toBe("fade"));
  test("the device asks for less motion: fade, never a jump", () => expect(levelFor(false, false, true)).toBe("fade"));
  test("calm is off whatever else is set", () => {
    expect(levelFor(true, false, false)).toBe("off");
    expect(levelFor(true, true, true)).toBe("off");
  });
});
