"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { Trans } from "@lingui/react/macro";
import { ChevronDownIcon } from "@/components/icons";
import { cueVisible } from "@/lib/landing-story";

/**
 * "There is more below": a small arrow and the word at the bottom of the first screen, gone once the visitor has scrolled
 * (docs/landing-story-design.md). The arrow bobs only when motion is allowed (`.scroll-cue-arrow` in globals.css).
 * Tapping it scrolls to just below the first screen, smoothly only when the visitor allows motion.
 */
export function ScrollCue() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onScroll = () => setVisible(cueVisible(window.scrollY));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const go = (e: MouseEvent<HTMLButtonElement>) => {
    const hero = e.currentTarget.closest("section");
    if (!hero) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.hasAttribute("data-calm");
    window.scrollTo({ top: hero.getBoundingClientRect().bottom + window.scrollY, behavior: calm ? "auto" : "smooth" });
  };
  return (
    <div className={`pointer-events-none absolute inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] flex justify-center md:bottom-6 transition-opacity duration-300 motion-reduce:transition-none ${visible ? "opacity-100" : "opacity-0"}`}>
      {/* Once it has faded out it can be neither tapped nor reached with the keyboard. */}
      <button
        type="button"
        onClick={go}
        tabIndex={visible ? undefined : -1}
        aria-hidden={visible ? undefined : true}
        className={`tap-target flex flex-col items-center gap-1 rounded-xl px-4 text-white ${visible ? "pointer-events-auto" : ""}`}
      >
        <span className="text-base font-bold [text-shadow:0_1px_6px_rgb(0_0_0/0.7)]">
          <Trans>スクロール</Trans>
        </span>
        <span aria-hidden="true" className="scroll-cue-arrow [filter:drop-shadow(0_1px_4px_rgb(0_0_0/0.6))]">
          <ChevronDownIcon />
        </span>
      </button>
    </div>
  );
}
