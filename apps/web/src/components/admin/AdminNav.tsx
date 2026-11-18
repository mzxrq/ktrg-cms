"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { ReactNode } from "react";
import { ArticleIcon, BellIcon, ChartIcon, ChevronDownIcon, ChevronUpIcon, ClockIcon, CommentIcon, DocumentIcon, FlagIcon, FuriganaIcon, GearIcon, GlobeIcon, ImageIcon, MapIcon, PencilIcon, PinIcon, RouteIcon, ShopIcon, StampIcon, UserIcon, WarningIcon } from "@/components/icons";

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
// screen the list folds behind a button, so it does not push the page down.
export function AdminNav({ lists, isAdmin, footer }: { lists: { key: string; title: string }[]; isAdmin: boolean; footer: ReactNode }) {
  const { t } = useLingui();
  const pathname = usePathname() ?? "";
  const base = "/admin";
  const [open, setOpen] = useState(false);

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

  // A titled group folds to its title, so the whole menu fits without scrolling (2026-11-16, user); the group holding
  // the open screen starts open. The rail folded to icons shows every icon.
  const [shut, setShut] = useState<Set<number>>(() => new Set(sections.flatMap((g, i) => (g.title && !g.items.some(isActive) ? [i] : []))));
  const flip = (i: number) => setShut((now) => (now.has(i) ? new Set([...now].filter((x) => x !== i)) : new Set([...now, i])));

  return (
    <nav aria-label={t`管理メニュー`} className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="admin-menu"
        onClick={() => setOpen((v) => !v)}
        className="tap-target flex items-center justify-between rounded-full border border-line px-4 text-lg font-bold lg:hidden"
      >
        {t`メニュー`}
        {open ? <ChevronUpIcon size={22} /> : <ChevronDownIcon size={22} />}
      </button>
      <div id="admin-menu" className={`${open ? "flex" : "hidden"} flex-col gap-1 lg:flex`}>
        {sections.map((group, i) => (
          <div key={i} className={`flex flex-col gap-1 ${i > 0 ? "mt-2 border-t border-line pt-3" : ""}`}>
            {group.title ? (
              <button
                type="button"
                aria-expanded={!shut.has(i)}
                aria-controls={`admin-menu-${i}`}
                onClick={() => flip(i)}
                className="tap-target flex items-center justify-between rounded-full px-4 text-base font-bold text-muted hover:bg-surface lg:group-data-[folded=true]:hidden"
              >
                {group.title}
                {shut.has(i) ? <ChevronDownIcon size={20} /> : <ChevronUpIcon size={20} />}
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
