"use client";

// The rally's own movements (docs/rally-design.md, docs/motion-design.md): a book page turning and the walker moving.
// Each one follows the visitor's level: Full moves, Fade only fades the page and puts the walker there at once, Off changes
// everything at once. Before GSAP has loaded (or at Off, when it never loads) things simply change, so a tap never waits.

import { getGsap, motionLevel } from "./motion";

/** A page turning in: it slides in from the side it came from at Full, fades at Fade only, and just changes at Off. */
export function turnIn(el: HTMLElement, dir: 1 | -1): void {
  const g = getGsap();
  const level = motionLevel();
  if (!g || level === "off") return;
  g.fromTo(
    el,
    level === "full" ? { x: dir * 36, opacity: 0 } : { opacity: 0 },
    { x: 0, opacity: 1, duration: level === "full" ? 0.28 : 0.18, ease: "power2.out", clearProps: "transform,opacity", overwrite: "auto" },
  );
}

/**
 * Move a walker to an offset in pixels: it walks there at Full (`from` is where it starts), and stands there at once at the
 * other levels. An offset of 0 is its home.
 */
export function moveTo(el: SVGElement, to: { x?: number; y?: number }, seconds: number, from?: { x?: number; y?: number }): void {
  const g = getGsap();
  if (g) g.killTweensOf(el);
  if (g && motionLevel() === "full") {
    if (from) g.set(el, from);
    g.to(el, { ...to, duration: seconds, ease: "power1.inOut", overwrite: "auto" });
    return;
  }
  if (g) g.set(el, to);
  else el.style.transform = `translate(${to.x ?? 0}px, ${to.y ?? 0}px)`;
}

/** How long the walker takes to cover `pixels` (a short hop is quick, a long walk never takes more than a second or so). */
export const walkSeconds = (pixels: number): number => Math.min(1.2, 0.35 + Math.abs(pixels) / 1100);
