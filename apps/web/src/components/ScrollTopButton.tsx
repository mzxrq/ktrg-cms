"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { ArrowUpIcon } from "@/components/icons";

/**
 * A round floating button back to the top of any long page, once the visitor has scrolled down about two screens
 * (2026-11-16, user's manager: long pages on a phone). It sits above the tab bar. Not on the map page (one screen) nor the
 * home page, which ends with its own BackToTop button.
 */
export function ScrollTopButton() {
  const { t } = useLingui();
  const pathname = usePathname() ?? "";
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const check = () => setShown(window.scrollY > window.innerHeight * 2);
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, [pathname]);
  if (!shown || pathname === "/" || pathname.startsWith("/map")) return null;
  return (
    <button
      type="button"
      data-scroll-top
      aria-label={t`ページの先頭へ`}
      title={t`ページの先頭へ`}
      onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}
      className="tap-target fixed right-4 z-30 grid size-12 place-items-center rounded-full border border-line bg-paper text-ink shadow-lg print:hidden"
      style={{ bottom: "calc(var(--tabbar-room) + 1rem + env(safe-area-inset-bottom))" }}
    >
      <ArrowUpIcon />
    </button>
  );
}
