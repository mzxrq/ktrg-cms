import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 2026-11-12: the badges page matches the other restyled screens (Mincho red title). 2026-11-16: in the rally pages' language —
// progress as the trail with the walker, the nearest badge in one capsule, the medals on open ground (no box each).
const page = readFileSync(join(import.meta.dir, "..", "app", "(public)", "badges", "page.tsx"), "utf8");

test("badges page: Mincho red title, the trail progress, one capsule, medals without boxes", () => {
  expect(page).toMatch(/<h1 className="font-serif text-3xl font-bold text-accent wide:text-4xl">/);
  expect(page).toMatch(/<PathProgress /);
  expect(page.match(/rounded-\[1\.75rem\] bg-surface/g)).toHaveLength(1);
  expect(page).not.toMatch(/rounded-3xl/);
});
