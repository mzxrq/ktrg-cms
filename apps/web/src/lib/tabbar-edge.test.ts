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
