import { useId } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";

/**
 * A small "i" beside a label that opens a short explanation with a "Learn more" link, just under the "i", like the photo's ©
 * (CreditToggle). It uses the browser's own popover (above every card, so nothing cuts it; a tap outside or Escape closes it),
 * so it needs no script. CSS anchor positioning pins it under the button and keeps it on screen; a browser
 * without anchor positioning keeps the old centred box over a dimmed page. Not for use inside a link.
 */
export function InfoTip({ label, href, children }: { label: string; href: string; children: ReactNode }) {
  const { t } = useLingui();
  const id = useId();
  const anchor = `--tip-${id.replace(/[^\w-]/g, "")}`; // useId has characters a CSS name cannot hold
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-label={label}
        style={{ anchorName: anchor }}
        // The ring is 20 px; the invisible ::before makes the tap area 44 px.
        className="relative ml-1 -my-1.5 inline-flex size-5 min-h-0 min-w-0 cursor-pointer before:absolute before:-inset-3 before:content-[''] items-center justify-center rounded-full p-0 align-middle text-muted hover:text-ink"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="9.5" />
          <path d="M12 11v6" />
          <circle cx="12" cy="7.4" r="0.6" fill="currentColor" />
        </svg>
      </button>
      <div
        id={id}
        popover="auto"
        // Centred under the "i", slid back inside a 16 px gutter near a screen edge; above it when there is no room below.
        style={{ positionAnchor: anchor, positionArea: "bottom span-all", positionTryFallbacks: "flip-block" }}
        // The ©'s dark tag (CreditToggle), a little more solid so the page's words do not show through several lines of text.
        className="m-auto w-[min(22rem,calc(100vw-2rem))] rounded-lg bg-black/85 p-4 text-base font-normal leading-7 text-white shadow-lg backdrop:bg-black/40 supports-[position-area:bottom]:inset-auto supports-[position-area:bottom]:mx-4 supports-[position-area:bottom]:my-1 supports-[position-area:bottom]:backdrop:bg-transparent"
      >
        <p className="mb-3">{children}</p>
        <Link href={href} className="font-bold text-white underline underline-offset-4">
          {t`くわしく見る`}
        </Link>
      </div>
    </>
  );
}
