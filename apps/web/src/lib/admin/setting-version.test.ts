import { expect, test } from "bun:test";
import { versionFrom, withVersion } from "./setting-version";

test("the version read goes with the save; never saved is empty; unknown sends none", () => {
  expect(withVersion("/x", "2026-11-28T00:00:00.000Z")).toBe("/x?updatedAt=2026-11-28T00%3A00%3A00.000Z");
  expect(withVersion("/x", null)).toBe("/x?updatedAt=");
  expect(withVersion("/x", undefined)).toBe("/x");
  expect(versionFrom({ ok: true, updatedAt: "t" })).toBe("t");
  expect(versionFrom({ ok: true })).toBeUndefined();
});
