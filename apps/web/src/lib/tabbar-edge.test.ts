import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 2026-11-16, a Huawei phone: the tab bar sometimes sat behind Android's navigation bar. Chrome's edge-to-edge guide: pad by
// the largest inset and move only `bottom`; never the moving inset in padding.
const src = join(import.meta.dir, "..");
const read = (...p: string[]) => readFileSync(join(src, ...p), "utf8");

test("the phone tab bar pads for the largest inset and moves by the current one", () => {
  const css = read("app", "globals.css");
  expect(css).toMatch(/\[data-tabbar\] \{\s*padding-bottom: calc\(0\.375rem \+ env\(safe-area-max-inset-bottom, env\(safe-area-inset-bottom, 0px\)\)\);\s*bottom: calc\(env\(safe-area-inset-bottom, 0px\) - env\(safe-area-max-inset-bottom/);
  expect(read("components", "TabBar.tsx")).not.toMatch(/pb-\[calc\([^\]]*safe-area-inset-bottom/);
});

test("the installed app keeps its own placement: the browser-tab rule never sets `bottom` there", () => {
  const css = read("app", "globals.css");
  // The rule that moves `bottom` is for a browser tab only; the standalone rule (bottom: auto; top: 100dvh) must win in the app.
  expect(css).toMatch(/@media \(max-width: 767px\) and \(display-mode: browser\) \{\s*\[data-tabbar\] \{\s*padding-bottom: calc\(0\.375rem \+ env\(safe-area-max-inset-bottom/);
  const phoneRules = [...css.matchAll(/@media \(max-width: 767px\) \{\s*\[data-tabbar\] \{([^}]*)\}/g)].map((m) => m[1]!);
  for (const body of phoneRules) expect(body).not.toMatch(/(^|[^-])bottom:/);
  expect(css).toMatch(/@media \(display-mode: standalone\) and \(max-width: 767px\) \{\s*\[data-tabbar\] \{\s*bottom: auto;\s*top: 100dvh;/);
});
