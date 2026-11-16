"use client";

import { useLayoutEffect, useRef } from "react";
import { enter } from "@/lib/motion";

let firstLoad = true;

/**
 * A page change: the page area (#main) fades in. Put in a `template.tsx`, which Next.js draws again for every page it moves to.
 * The first page of a visit is already on screen, drawn by the server, so it is left alone (a script would hide it and bring it
 * back, a flash). Opacity only, never movement: a moving ancestor would carry the fixed stamp button and tab bar along with it.
 */
export function RouteFade() {
  const ran = useRef(false);
  useLayoutEffect(() => {
    if (ran.current) return; // the development double run
    ran.current = true;
    if (firstLoad) {
      firstLoad = false;
      return;
    }
    const main = document.getElementById("main");
    if (main) enter(main, "fade");
  }, []);
  return null;
}
