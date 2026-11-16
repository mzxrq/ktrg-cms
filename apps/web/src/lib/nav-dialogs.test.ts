import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Rule 1 of docs/navigation-v2-plan.md (user, 2026-11-16: a dialog that makes the walker scroll to its buttons is not
// acceptable): a navigation dialog never scrolls as a whole; its buttons sit in a footer (data-nav-footer) that stays on
// screen, and only the part between header and footer may scroll.
const files = ["NavPrompts.tsx", "NavFarCard.tsx", "NavTargetPicker.tsx"];
const read = (f: string) => readFileSync(join(import.meta.dir, "..", "components", "navigation", f), "utf8");

test.each(files)("%s: the dialog box does not scroll, and its buttons are in a footer that stays on screen", (f) => {
  const src = read(f);
  const boxes = [...src.matchAll(/<(dialog|section)\b[^>]*role="(?:alert)?dialog"[^>]*>|<dialog\b[^>]*>/g)].map((m) => m[0]);
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(box).not.toContain("overflow-y-auto");
    expect(box).toContain("overflow-hidden");
  }
  const footers = [...src.matchAll(/<div data-nav-footer className="([^"]*)"/g)].map((m) => m[1]!);
  expect(footers.length).toBeGreaterThan(0);
  for (const cls of footers) {
    expect(cls).toContain("shrink-0");
    expect(cls).not.toContain("overflow");
  }
});

test("the arrival photo gives way on a short screen and takes at most 30 % of the height", () => {
  const src = read("NavPrompts.tsx");
  expect(src).toMatch(/aspect-\[16\/9\] max-h-\[30dvh\] shrink-0[^"]*\[@media\(max-height:34rem\)\]:hidden/);
});
