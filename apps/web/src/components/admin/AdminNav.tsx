"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { ArticleIcon, BellIcon, ChartIcon, ChevronDownIcon, ChevronUpIcon, ClockIcon, CloseIcon, CommentIcon, DocumentIcon, FlagIcon, FuriganaIcon, GearIcon, GlobeIcon, ImageIcon, MapIcon, MenuIcon, PencilIcon, PinIcon, RouteIcon, ShopIcon, StampIcon, UserIcon, WarningIcon } from "@/components/admin/admin-icons";

/** The picture beside each list in the menu; a list the app does not know yet gets a plain document. */
const LIST_ICONS: Record<string, ReactNode> = {
  notices: <BellIcon />,
  banners: <ImageIcon />,
  directory: <ShopIcon />,
  places: <PinIcon />,
  stamps: <StampIcon />,
  users: <UserIcon />,
  audit: <ClockIcon />,
  posts: <ArticleIcon />,
  authors: <PencilIcon />,
  comments: <CommentIcon />,
  furigana: <FuriganaIcon />,
};

// The side menu of the admin area. The screens that exist are links (the generic lists come from the API, see
// lib/admin/lists); the others are listed so the editors can see what is coming, and are not links yet. On a narrow
// screen it is a panel that slides over the page from the left (2026-11-18, user: opening it used to push the page down),
// closed by ✕, a tap beside it, Escape or following a link.
export function AdminNav({ lists, isAdmin, footer }: { lists: { key: string; title: string }[]; isAdmin: boolean; footer: ReactNode }) {
  const { t } = useLingui();
  const pathname = usePathname() ?? "";
  const base = "/admin";
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  // Following a link closes the panel (adjusted while rendering, the way React recommends).
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
  }
  // While open: focus in the panel, Escape closes, the page behind neither scrolls nor takes focus; a wide screen closes it.
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const page = document.getElementById("main");
    page?.setAttribute("inert", "");
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const wide = window.matchMedia("(min-width: 64rem)");
    const onWide = () => {
      if (wide.matches) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    const button = menuButton.current;
    return () => {
      page?.removeAttribute("inert");
      document.body.style.overflow = scroll;
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
      button?.focus();
    };
  }, [open]);

  const ready = [
    // The dashboard is the admin's home (an editor's home is the route list); its page and the API are for an admin only.
    ...(isAdmin ? [{ key: "dashboard", href: base, label: t`ダッシュボード`, icon: <ChartIcon /> }] : []),
    // Every course and place on one map (docs/one-map-editor-design.md).
    { key: "map", href: `${base}/map`, label: t`地図`, icon: <MapIcon /> },
    { key: "routes", href: `${base}/routes`, label: t`コース`, icon: <RouteIcon /> },
    { key: "rallies", href: `${base}/rallies`, label: t`ラリー`, icon: <FlagIcon /> },
    { key: "visits", href: `${base}/visits`, label: t`アクセス解析`, icon: <GlobeIcon /> },
    { key: "attention", href: `${base}/attention`, label: t`直すところ`, icon: <WarningIcon /> },
    // Banners live on the home page's screen (ページ > ホーム), so they have no line of their own.
    ...lists.filter((l) => l.key !== "authors" && l.key !== "tags" && l.key !== "banners").map((l) => ({ key: l.key, href: `${base}/${l.key}`, label: l.title, icon: LIST_ICONS[l.key] ?? <DocumentIcon /> })),
    { key: "pages", href: `${base}/pages`, label: t`ページ`, icon: <DocumentIcon /> },
    // The map's look is for an admin only (the API refuses an editor). It sits with the routes (2026-11-16, user: every admin
    // change is site-wide, so "site settings" said nothing).
    ...(isAdmin ? [{ key: "settings", href: `${base}/settings`, label: t`地図の見た目`, icon: <GearIcon /> }] : []),
  ];
  // Menu sections, split by a line. A list the app does not know yet joins the site's content.
  const SECTIONS: { title?: string; keys: string[] }[] = [
    { keys: ["attention"] },
    { keys: ["dashboard"] },
    { title: t`コースとラリー`, keys: ["map", "routes", "rallies", "stamps", "places", "directory", "settings"] },
    { title: t`サイトの内容`, keys: ["notices", "furigana", "pages", "posts"] },
    { title: t`コミュニティ`, keys: ["comments", "users"] },
    { title: t`運営`, keys: ["visits", "audit"] },
  ];
  const known = new Set(SECTIONS.flatMap((s) => s.keys));
  const isActive = (item: { key: string; href: string }) =>
    item.key === "dashboard" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`) || (item.key === "posts" && pathname.startsWith(`${base}/authors`)) || (item.key === "pages" && pathname.startsWith(`${base}/banners`));
  const sections = SECTIONS.map((s, i) => ({ title: s.title, items: [...s.keys.flatMap((k) => ready.filter((r) => r.key === k)), ...(i === 3 ? ready.filter((r) => !known.has(r.key)) : [])] })).filter((s) => s.items.length > 0);

  // A titled group folds to its title (2026-11-16, user); every group starts open (2026-11-20, user). The rail folded to
  // icons shows every icon.
  const [shut, setShut] = useState<Set<number>>(() => new Set());
  const flip = (i: number) => setShut((now) => (now.has(i) ? new Set([...now].filter((x) => x !== i)) : new Set([...now, i])));

  return (
    <nav aria-label={t`管理メニュー`} className="flex flex-col gap-1">
      <button
        ref={menuButton}
        type="button"
        aria-expanded={open}
        aria-controls="admin-menu"
        onClick={() => setOpen(true)}
        className="tap-target flex w-fit items-center gap-2 rounded-full border border-line px-4 text-lg font-bold lg:hidden"
      >
        <MenuIcon />
        {t`メニュー`}
      </button>
      {/* The dimmed page beside the open panel: a tap there closes it (the ✕ is the keyboard's way). */}
      {open ? <button type="button" tabIndex={-1} aria-hidden onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/50 lg:hidden" /> : null}
      <div
        id="admin-menu"
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-label={open ? t`管理メニュー` : undefined}
        className={`${open ? "fixed inset-y-0 left-0 z-50 flex w-80 max-w-[85vw] overflow-y-auto overscroll-contain bg-paper p-4 shadow-xl" : "hidden"} flex-col gap-1 lg:static lg:z-auto lg:flex lg:w-auto lg:max-w-none lg:overflow-visible lg:bg-transparent lg:p-0 lg:shadow-none`}
      >
        {open ? (
          <div className="mb-2 flex justify-end lg:hidden">
            <button ref={closeButton} type="button" onClick={() => setOpen(false)} aria-label={t`メニューを閉じる`} className="tap-target inline-flex items-center justify-center rounded-full border border-line text-ink hover:bg-surface">
              <CloseIcon />
            </button>
          </div>
        ) : null}
        {sections.map((group, i) => (
          <div key={i} className={`flex flex-col gap-1 ${i > 0 ? "mt-2 border-t border-line pt-3" : ""}`}>
            {group.title ? (
              <button
                type="button"
                aria-expanded={!shut.has(i)}
                aria-controls={`admin-menu-${i}`}
                onClick={() => flip(i)}
                className="tap-target flex items-center justify-between gap-2 whitespace-nowrap rounded-full px-3 text-left text-sm font-bold text-muted hover:bg-surface lg:group-data-[folded=true]:hidden"
              >
                {group.title}
                {shut.has(i) ? <ChevronDownIcon size={16} /> : <ChevronUpIcon size={16} />}
              </button>
            ) : null}
            <div id={`admin-menu-${i}`} className={`${shut.has(i) ? "hidden lg:group-data-[folded=true]:flex" : "flex"} flex-col gap-1`}>
            {group.items.map((item) => {
              // 書き手 is part of the blog, so the blog stays lit there; the banners are part of the home page.
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={item.label}
                  className={`tap-target flex items-center gap-3 rounded-full px-4 text-lg font-bold lg:group-data-[folded=true]:justify-center lg:group-data-[folded=true]:rounded-[1.125rem] lg:group-data-[folded=true]:px-0 ${active ? "bg-selected text-on-selected" : "text-ink hover:bg-surface"}`}
                >
                  <span className="shrink-0">{item.icon}</span>
                  <span className="lg:group-data-[folded=true]:sr-only">{item.label}</span>
                </Link>
              );
            })}
            </div>
          </div>
        ))}
        {footer}
      </div>
    </nav>
  );
}
