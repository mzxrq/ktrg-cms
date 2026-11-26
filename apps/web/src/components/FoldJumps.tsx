"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import { activeSection } from "@/lib/active-section";
import { useLingui } from "@lingui/react/macro";
import { BookmarkButton } from "@/components/BookmarkButton";
import { BOOKMARK_ANCHOR } from "@/lib/page-anchors";

/**
 * The course page's sticky bar on a phone: the bookmark, then the titles of its folds. A title opens its fold and scrolls to
 * it (the folds are closed at first, so a plain #link would land on a shut heading). From a wide box everything is open and
 * the bar is not shown. The links are spaced by their own padding, not a gap: a tap target's 3rem minimum width left a short title (歴史) with empty space after it. Each target is an element with an id that holds one <details>.
 */
/** True when the element has scrolled up past the top of the screen (not when it is merely below the fold). */
function useScrolledAbove(id: string): boolean {
  const [above, setAbove] = useState(false);
  useEffect(() => {
    const el = document.getElementById(id);
    if (!el || typeof IntersectionObserver === "undefined") return;
    const watch = new IntersectionObserver(([entry]) => setAbove(!!entry && !entry.isIntersecting && entry.boundingClientRect.bottom < 0));
    watch.observe(el);
    return () => watch.disconnect();
  }, [id]);
  return above;
}

/** Which of these sections is being read (index, -1 above the first): the last whose top has reached the bar's bottom edge. */
function useActiveSection(ids: string[], bar: RefObject<HTMLElement | null>): number {
  const [active, setActive] = useState(-1);
  const key = ids.join(" ");
  useEffect(() => {
    const list = key.split(" ");
    let frame = 0;
    const check = () => {
      frame = 0;
      const line = (bar.current?.getBoundingClientRect().bottom ?? 0) + 8;
      setActive(activeSection(list.map((id) => document.getElementById(id)?.getBoundingClientRect().top ?? Infinity), line));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [key, bar]);
  return active;
}

export function FoldJumps({ routeId, items }: { routeId: string | null; items: { id: string; label: ReactNode }[] }) {
  const { t } = useLingui();
  const scrolledAbove = useScrolledAbove(BOOKMARK_ANCHOR);
  const bar = useRef<HTMLElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const active = useActiveSection(items.map((item) => item.id), bar);
  // The titles scroll sideways on a narrow phone: keep the underlined one in sight.
  useEffect(() => {
    const ul = list.current;
    const link = ul?.querySelector<HTMLElement>("[aria-current]");
    if (!ul || !link) return;
    if (link.offsetLeft < ul.scrollLeft || link.offsetLeft + link.offsetWidth > ul.scrollLeft + ul.clientWidth) {
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      ul.scrollTo({ left: link.offsetLeft - 16, behavior: calm ? "auto" : "smooth" });
    }
  }, [active]);

  function jump(e: MouseEvent<HTMLAnchorElement>, id: string) {
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    const details = target.querySelector("details");
    if (details) details.open = true;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
  }

  return (
    // Solid background on purpose: a see-through bar at the top edge brings back iOS's status-bar blur (globals.css).
    // data-fab-room: keeps its right end clear of the round menu button while the tab bar is away (globals.css).
    <nav ref={bar} data-fab-room aria-label={t`このページの項目`} className="sticky top-[var(--top-clear)] z-20 order-3 flex items-center border-b border-line/30 bg-paper py-1 @4xl:hidden">
      {/* Beside the title list but out of the way at first: it grows in when the bookmark button above has scrolled off. */}
      {routeId ? (
        <div className={`shrink-0 transition-[max-width,opacity] motion-reduce:transition-none ${scrolledAbove ? "max-w-20 overflow-visible pl-4 pr-2 opacity-100" : "max-w-0 overflow-hidden opacity-0"}`} inert={!scrolledAbove}>
          <BookmarkButton routeId={routeId} compact />
        </div>
      ) : null}
      <ul ref={list} className="flex min-w-0 overflow-x-auto px-1 [scrollbar-width:none]">
        {items.map((item, i) => (
          <li key={item.id} className="shrink-0">
            {/* The section being read is underlined in the brand red (a line, not text, so the brand colour is allowed). */}
            <a href={`#${item.id}`} onClick={(e) => jump(e, item.id)} aria-current={i === active ? "location" : undefined} className="tap-target inline-flex min-w-0! items-center px-3 text-lg font-bold text-ink decoration-[3px] underline-offset-8 hover:underline aria-[current=location]:underline aria-[current=location]:decoration-brand">
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
