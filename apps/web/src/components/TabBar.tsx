"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import {
  CloseIcon,
  HomeIcon,
  MapIcon,
  MenuIcon,
  PanelIcon,
  RouteIcon,
  StampIcon,
} from "./icons";
import { KatsuragiLogo } from "./KatsuragiLogo";
import { LOW_QUERY, watchQuery } from "@/lib/screen";
import { useMenu } from "./MenuProvider";
import { initialBars, nextBars } from "@/lib/scroll-bars";

const subscribeLow = (onChange: () => void) => watchQuery(LOW_QUERY, onChange);

// The sidebar folded to a narrow rail: remembered on this device, and still works where the browser keeps nothing.
const FOLD_KEY = "sidebar-folded";
const foldListeners = new Set<() => void>();
let folded: boolean | null = null;
function isFolded() {
  if (folded === null) {
    try {
      folded = localStorage.getItem(FOLD_KEY) === "1";
    } catch {
      folded = false;
    }
  }
  return folded;
}
function setFolded(on: boolean) {
  folded = on;
  try {
    localStorage.setItem(FOLD_KEY, on ? "1" : "0");
  } catch {
    // Kept for this visit only.
  }
  foldListeners.forEach((l) => l());
}
function subscribeFold(listener: () => void) {
  foldListeners.add(listener);
  return () => foldListeners.delete(listener);
}

// Tabs with an icon plus a word. On a phone: a floating rounded bar near the bottom, where the thumb is, with
// the active tab as a filled pill. On a tablet (768-1023 px) only the menu is shown, as one dark button at the top right;
// the tabs are inside the menu, which slides in from the left (2026-11-19, the user's reference: a tablet reads like a
// phone page, with a menu button instead of a tab bar). From 1024 px it is a sidebar fixed to the far left: the logo (a
// link home), the tabs centred, the menu as one more item, and at the bottom `footer` (the language picker).
/** The panel's ground: a thin double frame set in from the edge with a faint 七宝 inside it only (the margin outside
 *  stays plain, 2026-11-19). Decoration only. `show` is the variant it appears at (the desktop sidebar); none = always (the
 *  menu drawer). Never pass a plain "block": it ties with "hidden", and Tailwind's order lets "hidden" win. */
export const panelGround = (show?: string) => (
  <span
    aria-hidden="true"
    className={`pointer-events-none absolute inset-2 -z-10 border-[3px] border-double border-on-rail/35 ${show ? `hidden ${show}` : ""}`}
  >
    <span className="pattern-shippo pattern-on-rail block size-full" />
    {/* The top and bottom lines open in the middle (2026-11-19, the user's idea): an open frame, not a box. */}
    <span className="absolute -top-[3px] left-1/2 h-[3px] w-1/3 -translate-x-1/2 bg-rail" />
    <span className="absolute -bottom-[3px] left-1/2 h-[3px] w-1/3 -translate-x-1/2 bg-rail" />
  </span>
);

export function TabBar({ footer }: { footer?: ReactNode }) {
  const { t } = useLingui();
  const pathname = usePathname() ?? "";
  const { open, setOpen, railButton } = useMenu();
  const foldedByHand = useSyncExternalStore(
    subscribeFold,
    isFolded,
    () => false,
  );
  // A phone on its side has no width to spare: the menu stays folded, and there is no button to open it.
  const low = useSyncExternalStore(
    subscribeLow,
    () => window.matchMedia(LOW_QUERY).matches,
    () => false,
  );
  const mini = foldedByHand || low;

  // The bar's real height (its padding for the phone's home line included), for the phone menu to end exactly on top of it
  // (globals.css --menu-bottom). --tabbar-room is a rounder 5.5rem kept for things floating above the bar, and the menu
  // ended above a strip of the page with it (2026-11-26, live).
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const watch = new ResizeObserver(() => root.style.setProperty("--tabbar-h", `${nav.offsetHeight}px`));
    watch.observe(nav);
    return () => {
      watch.disconnect();
      root.style.removeProperty("--tabbar-h");
    };
  }, []);

  // While reading on a phone, scrolling down tucks the tab bar away and scrolling up brings it
  // back (lib/scroll-bars.ts). It only sets <html data-bars="hidden">; the CSS decides who moves (phones only). A new page
  // shows them; an open menu keeps them as they were (opened from the round menu button, that button stays to close it).
  useEffect(() => {
    const root = document.documentElement;
    if (open) return;
    // Carry on from where the bars were before the menu opened (a new page has already shown them, below).
    let state = { ...initialBars(window.scrollY), hidden: root.dataset.bars === "hidden" };
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        state = nextBars(
          state,
          window.scrollY,
          document.documentElement.scrollHeight - window.innerHeight,
        );
        if (state.hidden) root.dataset.bars = "hidden";
        else delete root.dataset.bars;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [open, pathname]);
  // A new page (or leaving these pages) shows the bars again. Its cleanup runs before the effect above reads them.
  // Kept to one line so the lines below (and the catalogs' line numbers) stay where they were.
  useEffect(() => () => { delete document.documentElement.dataset.bars; }, [pathname]);

  const tabs = [
    { path: "/", label: t`ホーム`, icon: <HomeIcon /> },
    { path: "/map", label: t`マップ`, icon: <MapIcon /> },
    { path: "/routes", label: t`コース`, icon: <RouteIcon /> },
    { path: "/rallies", label: t`スタンプ`, icon: <StampIcon /> },
  ];

  // The label is capped at 4.25vw so "Routes" still fits a 320 px phone at the largest text size; wider screens never hit the cap.
  const item =
    "flex min-h-[3.25rem] min-w-0 flex-col items-center justify-center gap-0.5 rounded-[1.125rem] text-[min(0.875rem,4.25vw)] font-bold leading-tight [&_svg]:size-6 wide:min-h-14 md:flex-row md:justify-start md:gap-4 md:rounded-xl md:px-5 md:text-xl";
  // Folded, a tab is its icon over its word again, as on a phone.
  const miniItem = mini
    ? ` wide:flex-col wide:justify-center wide:gap-0.5 wide:rounded-[1.125rem] wide:px-0 wide:text-sm ${low ? "wide:min-h-12" : ""}`
    : "";

  return (
    // Below 1024 px this wrapper adds nothing (the nav is placed by its own classes); from 1024 px it is the sidebar.
    <div
      data-rail={mini ? "mini" : "full"}
      className={`print:hidden md:contents wide:sticky wide:top-0 wide:isolate wide:flex wide:h-dvh wide:shrink-0 wide:flex-col wide:self-start wide:overflow-y-auto wide:border-r wide:border-line/30 wide:bg-rail ${mini ? "wide:w-20" : "wide:w-64"}`}
    >
      {panelGround("wide:block")}
      <Link
        href="/"
        aria-label={t`ホーム`}
        className={`hidden wide:block ${low ? "px-2 pt-2" : mini ? "px-2 pt-4" : "px-[29px] pb-2 pt-8"}`}
      >
        <KatsuragiLogo
          compact
          className={`[--color-brand:var(--color-rail-mark)] [--color-ink:var(--color-on-rail)] ${mini ? "mx-auto h-8 w-auto" : "h-16 w-auto"}`}
        />
      </Link>
      {low ? null : (
        <button
          type="button"
          onClick={() => setFolded(!mini)}
          aria-expanded={!mini}
          aria-label={mini ? t`メニューを開く` : t`メニューをたたむ`}
          title={mini ? t`開く` : t`たたむ`}
          className={`tap-target hidden items-center justify-center rounded-full text-ink hover:bg-surface wide:inline-flex ${mini ? "mx-auto mt-3 shrink-0" : "absolute right-5 top-5"}`}
        >
          <PanelIcon />
        </button>
      )}
      <nav
        ref={navRef}
        aria-label={t`メインメニュー`}
        data-tabbar
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-line/30 bg-paper px-1 min-[400px]:px-3 pt-1.5 md:inset-x-auto md:bottom-auto md:right-3 md:top-[calc(0.25rem+var(--top-clear))] md:border-t-0 md:bg-transparent md:p-0 wide:static wide:flex wide:h-auto wide:w-full wide:flex-1 wide:flex-col wide:self-auto ${low ? "wide:pt-1" : "wide:pt-4"} ${mini ? "wide:px-2" : "wide:px-[29px]"}`}
      >
        <ul
          className={`mx-auto grid max-w-xl grid-cols-5 gap-0.5 min-[400px]:gap-1 md:flex wide:my-auto wide:w-full wide:max-w-none wide:flex-col ${low ? "wide:gap-0.5" : "wide:gap-2"}`}
        >
          {tabs.map(({ path, label, icon }) => {
            const active =
              path === "/" ? pathname === "/" : pathname.startsWith(path);
            return (
              <li key={path} className="md:hidden wide:block">
                <Link
                  href={path}
                  aria-current={active ? "page" : undefined}
                  onClick={(e) => {
                    // With the menu open, the first tap on the tab you are in only closes it (you stay on this page); a second tap goes to the tab's own page.
                    if (open && active) e.preventDefault();
                    setOpen(false);
                  }}
                  className={`${item}${miniItem} ${active && !open ? "bg-selected text-on-selected" : "text-ink hover:bg-surface"}`}
                >
                  {icon}
                  {label}
                </Link>
              </li>
            );
          })}
          <li>
            <button
              ref={railButton}
              type="button"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-controls="site-menu"
              // On a tablet it is the only button: a dark pill over the page, at the top right.
              className={`${item}${miniItem} w-full md:min-h-11 md:border md:border-line md:bg-rail md:px-4 md:text-base md:shadow-[0_2px_10px_rgb(0_0_0/0.3)] wide:min-h-14 wide:border-0 wide:px-5 wide:text-xl wide:shadow-none ${
                open
                  ? "bg-ink text-paper md:text-ink wide:bg-ink wide:text-paper"
                  : "text-ink hover:bg-surface wide:bg-transparent"
              }`}
            >
              {/* On a tablet, while the menu is open, this button is its close button (the drawer has none of its own there). */}
              <span
                className={`contents ${open ? "md:hidden wide:contents" : ""}`}
              >
                <MenuIcon />
                {t`メニュー`}
              </span>
              {open ? (
                <span className="hidden md:contents wide:hidden">
                  <CloseIcon />
                  {t`閉じる`}
                </span>
              ) : null}
            </button>
          </li>
        </ul>
      </nav>
      {/* While the tab bar is tucked away on a phone, the menu stays in reach: a round menu button at the top right, in the
          tablet button's colours (2026-11-26, the boss's request). Shown only by the CSS (data-menu-fab). The bar stays
          away while the menu is open, so the menu then carries the tabs (data-menu-tabs) and this button closes it. */}
      <button
        type="button"
        data-menu-fab
        onClick={() => setOpen(!open)}
        aria-label={open ? t`閉じる` : t`メニュー`}
        aria-expanded={open}
        aria-controls="site-menu"
        className="tap-target fixed right-3 top-[calc(0.25rem+var(--top-clear))] z-40 hidden size-12 items-center justify-center rounded-full border border-line bg-rail text-ink shadow-[0_2px_10px_rgb(0_0_0/0.3)] print:hidden [&_svg]:size-6"
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>
      {/* Lined up with the tab pills (same side padding), clear of the frame at the bottom. */}
      {footer && !mini ? (
        <div className="hidden px-[29px] pb-[29px] pt-4 wide:block">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
