"use client";

import { useEffect } from "react";
import { installDialogMotion } from "@/lib/dialog-motion";
import { preloadMotion } from "@/lib/motion";

/** Switches on the open and close motion of every dialog (lib/dialog-motion.ts) and loads GSAP once the page is idle. Renders nothing. */
export function DialogMotion() {
  useEffect(() => {
    installDialogMotion();
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500));
    idle(() => preloadMotion());
  }, []);
  return null;
}
