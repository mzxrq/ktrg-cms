"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { drawnShare, motionMode, sealsPlaced } from "@/lib/journey";

/**
 * The home page's journey (tried at /home-trial, the default since 2026-11-18; JourneyScene stays behind 詳細設定): the same
 * static page as JourneyScene's, but nothing is pinned.
 * The page scrolls as any page does; each beat rises in as it arrives, and the ridge draws and the seals drop while the ridge
 * picture itself passes through the screen. Seniors watching the pinned scene did not see that they were moving on.
 * Calm on, no script or GSAP failing: the plain page. Reduced motion: beats fade in only, the ridge stays drawn.
 */
export function JourneyFlow({ children, seals }: { children: ReactNode; seals: number }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const mode = motionMode({ reduce: window.matchMedia("(prefers-reduced-motion: reduce)").matches, calm: document.documentElement.hasAttribute("data-calm"), fade: document.documentElement.hasAttribute("data-fade") });
    if (mode === "static") return;

    const stage = el.querySelector<HTMLElement>("[data-ridge-stage]");
    const ridgeSvg = el.querySelector<SVGPathElement>("[data-ridge]")?.ownerSVGElement ?? null;
    const dots = Array.from(el.querySelectorAll<HTMLElement>("[data-seal]"));
    const beats = Array.from(el.querySelectorAll<HTMLElement>("[data-beat]")).filter((b) => b.dataset.beat !== "0");

    let stop = () => {};
    let gone = false;
    void Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        if (gone) return;
        gsap.registerPlugin(ScrollTrigger);
        const ctx = gsap.context(() => {
          beats.forEach((beat) => {
            const from = mode === "fade" ? { opacity: 0 } : { opacity: 0, y: 32 };
            gsap.fromTo(beat, from, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out", clearProps: "opacity,transform", scrollTrigger: { trigger: beat, start: "top 85%", once: true } });
          });
          if (mode === "fade" || !stage) return;
          const draw = (share: number) => ridgeSvg?.style.setProperty("clip-path", `inset(-8px ${((1 - share) * 100).toFixed(2)}% -8px -8px)`);
          draw(0);
          gsap.set(dots, { opacity: 0, scale: 0.6 });
          let placed = 0;
          ScrollTrigger.create({
            trigger: stage,
            start: "top 90%",
            end: "bottom 40%",
            scrub: 0.6,
            onUpdate: (self) => {
              draw(drawnShare(self.progress));
              const n = sealsPlaced(self.progress, seals);
              if (n !== placed) {
                dots.forEach((dot, i) => gsap.set(dot, i < n ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.6 }));
                placed = n;
              }
            },
          });
        }, el);
        stop = () => {
          ctx.revert();
          ridgeSvg?.style.removeProperty("clip-path");
        };
      })
      .catch(() => ridgeSvg?.style.removeProperty("clip-path"));
    return () => {
      gone = true;
      stop();
    };
  }, [seals]);

  return (
    <div ref={root} data-journey>
      {children}
    </div>
  );
}
