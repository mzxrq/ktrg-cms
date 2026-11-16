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

// N2-4: the arrival is part of the navigation strip, not a card over the map; its small photo gives way on a short screen.
test("arrival lives in the strip: no arrival card, a small photo that hides on a short screen", () => {
  const src = read("NavPrompts.tsx");
  expect(src).not.toContain("ArrivalPrompt");
  expect(src).toMatch(/size-16 shrink-0[^"]*\[@media\(max-height:34rem\)\]:hidden/);
  const hud = read("NavigationHud.tsx");
  expect(hud).toContain("{far ? null : (arrivalStrip ?? progressLine)}");
  expect(hud).not.toContain("setLaterId");
});

// N2-6: the target picker is a bottom sheet on a phone, a centred box from 768 px, and closes on a tap outside it.
test("the target picker is a bottom sheet on a phone and closes on a tap on the dimmed map", () => {
  const src = read("NavTargetPicker.tsx");
  expect(src).toMatch(/className="nav-sheet mx-0 mb-0 mt-auto [^"]*w-full max-w-none[^"]*rounded-t-3xl[^"]*md:m-auto/);
  expect(src).toContain("if (e.target === e.currentTarget) dialog.current?.close();");
  expect(src).toContain("onClick={closeOnBackdrop}");
  expect(src).toContain("pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]");
  const css = readFileSync(join(import.meta.dir, "..", "app", "globals.css"), "utf8");
  expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*dialog\.nav-sheet\[open\] \{\s*animation: sheet-up/);
});
