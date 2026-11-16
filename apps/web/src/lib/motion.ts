"use client";

// Motion for things that appear and disappear (docs/motion-design.md). One place decides how much to move:
// Full (move and fade), Fade only (opacity), Off (nothing). GSAP is not in the shared bundle: it is loaded on
// idle after the first paint, and until it is ready (or when the level is Off) things simply appear and go at
// once, so a tap never waits for an animation.

import { useLayoutEffect, useRef, useState } from "react";
import type { gsap as Gsap } from "gsap";

export type MotionLevel = "full" | "fade" | "off";
/** What an element does when it enters or leaves: drop from the top (phone menu), pop out of a corner (wide menu), rise a little, or just fade. */
export type MotionKind = "drop" | "pop" | "rise" | "fade";

/**
 * The level now: calm is Off, the visitor's Fade only is fade, and the device's own reduce-motion setting also
 * gives fade (a person who asked their phone for less motion still gets a soft change, never a jump). Read at the
 * moment of use, so a change in the settings shows at once.
 */
export function motionLevel(): MotionLevel {
  if (typeof document === "undefined") return "off";
  const root = document.documentElement;
  return levelFor(root.hasAttribute("data-calm"), root.hasAttribute("data-fade"), window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

/** The rule on its own: calm wins, then the visitor's Fade only, then the device's reduce-motion setting. */
export function levelFor(calm: boolean, fade: boolean, deviceReduces: boolean): MotionLevel {
  if (calm) return "off";
  return fade || deviceReduces ? "fade" : "full";
}

let loaded: typeof Gsap | null = null;
let loading: Promise<void> | null = null;

/** Start loading GSAP (once). Call it when the page is idle; the level Off never loads it. */
export function preloadMotion(): void {
  if (loaded || loading || motionLevel() === "off") return;
  loading = import("gsap").then((m) => {
    loaded = m.gsap;
  });
}

// Where each kind starts (enter) and ends (leave), in pixels and scale; "fade" kinds use opacity only.
const MOVE: Record<MotionKind, gsap.TweenVars> = {
  drop: { y: -12 },
  pop: { scale: 0.95, x: -8 }, // the origin is set by the menu, beside its button
  rise: { y: 10 },
  fade: {},
};

const ENTER_S = 0.18;
const LEAVE_S = 0.15;
/** A leave that has not ended by now is forced to end, so a stuck tween can never leave an invisible element blocking the page. */
const LEAVE_LIMIT_MS = 600;

/** Bring an element in. Returns nothing to undo: a later leave or enter simply takes over the same element. */
export function enter(el: HTMLElement, kind: MotionKind): void {
  el.inert = false;
  const g = loaded;
  const level = motionLevel();
  if (!g || level === "off") {
    g?.killTweensOf(el);
    g?.set(el, { clearProps: "all" });
    return;
  }
  const from = level === "full" ? { opacity: 0, ...MOVE[kind] } : { opacity: 0 };
  g.fromTo(el, from, { opacity: 1, x: 0, y: 0, scale: 1, duration: ENTER_S, ease: "power2.out", clearProps: "opacity,transform", overwrite: true });
}

/**
 * Take an element out, then call `done` once (at once when there is nothing to animate). The element is made inert
 * at the start so focus and taps do not reach it while it leaves. Returns a cancel function for a reopen or unmount.
 */
export function leave(el: HTMLElement, kind: MotionKind, done: () => void): () => void {
  const g = loaded;
  const level = motionLevel();
  el.inert = true;
  if (!g || level === "off") {
    done();
    return () => {};
  }
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    done();
  };
  const timer = setTimeout(finish, LEAVE_LIMIT_MS);
  const to = level === "full" ? { opacity: 0, ...MOVE[kind] } : { opacity: 0 };
  g.to(el, { ...to, duration: LEAVE_S, ease: "power2.in", overwrite: true, onComplete: finish });
  return () => {
    finished = true;
    clearTimeout(timer);
    g.killTweensOf(el);
  };
}

/**
 * Keep an element mounted while it leaves. `mounted` says whether to render it; put `ref` on it. Opening mounts and
 * brings it in; closing takes it out and unmounts afterwards. Opening again mid-leave cancels the leave.
 */
export function usePresence<T extends HTMLElement>(open: boolean, kind: MotionKind | (() => MotionKind)) {
  const ref = useRef<T>(null);
  const [kept, setKept] = useState(open);
  if (open && !kept) setKept(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const k = typeof kind === "function" ? kind() : kind;
    if (open) {
      enter(el, k);
      return;
    }
    return leave(el, k, () => setKept(false));
    // `kind` is read when the change happens; it is not a reason to run again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return { mounted: open || kept, ref };
}
