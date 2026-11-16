import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// N2-2 (docs/navigation-v2-plan.md): on a phone with a system bar (Android's navigation, the iPhone's home line) the tab bar
// is 5.5rem plus that inset tall, so whatever sits above it adds --bar-inset; and Android's back closes a navigation card.
const read = (...p: string[]) => readFileSync(join(import.meta.dir, "..", ...p), "utf8");

test("--bar-inset is the inset while the tab bar shows, 0 when it is hidden", () => {
  const css = read("app", "globals.css");
  expect(css).toMatch(/:root \{\s*--tabbar-room: 0px;\s*--bar-inset: 0px;/);
  expect(css).toMatch(/--tabbar-room: 5\.5rem;\s*--bar-inset: env\(safe-area-inset-bottom, 0px\);/);
  expect(css).toMatch(/body\.map-tabs-hidden \{\s*--tabbar-room: 0px;\s*--bar-inset: 0px;/);
  expect(css).toMatch(/html\[data-bars="hidden"\][^{]*\{\s*--tabbar-room: 0px;\s*--bar-inset: 0px;/);
});

test("the navigation panel and the button above it start at the tab bar's top edge", () => {
  expect(read("components", "navigation", "NavigationHud.tsx")).toContain("bottom-[calc(var(--tabbar-room)+var(--bar-inset))]");
  expect(read("components", "map", "MapScreen.tsx")).toContain("bottom-[calc(var(--tabbar-room)+var(--bar-inset)+var(--nav-toast)+0.25rem)]");
});

test("the passed card closes with Android's back (the arrival is in the strip since N2-4, nothing to close)", () => {
  const src = read("components", "navigation", "NavPrompts.tsx");
  expect(src).toContain("useBackCloses(onGoOn)");
});
