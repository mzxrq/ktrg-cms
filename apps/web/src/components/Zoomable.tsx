"use client";

import { useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type TouchEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import { ChevronIcon, ChevronLeftIcon, MinusIcon, PlusIcon, XIcon } from "@/components/icons";
import { CreditWords } from "@/components/PhotoCredit";

/** One photo in the large view: `alt` is also its caption; `credit` is who took it (rich text), `sourceUrl` where it is from. */
export interface ViewerPhoto {
  src: string;
  alt: string;
  credit?: string | null;
  sourceUrl?: string | null;
}

const ZOOMS = [1, 1.5, 2, 3, 4];

/**
 * A photo you can tap to see large: `children` is the photo as the page draws it (inside a positioned box), and a tap opens
 * `photos[index]` over a dark screen. Top: "n / N", zoom in and out, close; the sides step through the other photos of the
 * same group (also the arrow keys and a swipe); the bottom says what it shows and who took it. A native modal <dialog>:
 * Escape closes it and focus stays inside. Zoomed, the photo scrolls inside its box; pinch to zoom works as on any page.
 */
export function Zoomable({ photos, index = 0, children }: { photos: ViewerPhoto[]; index?: number; children: ReactNode }) {
  const { t } = useLingui();
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const swipeFrom = useRef<number | null>(null);
  const [at, setAt] = useState(index);
  const [zoom, setZoom] = useState(0);
  const many = photos.length > 1;
  const photo = photos[at] ?? photos[0];
  if (!photo) return children;
  const scale = ZOOMS[zoom]!;

  const open = () => {
    setAt(index);
    setZoom(0);
    dialog.current?.showModal();
  };
  const go = (step: number) => {
    setAt((n) => (n + step + photos.length) % photos.length);
    setZoom(0);
  };
  // Keep the middle of what is seen in the middle while the photo grows or shrinks.
  const zoomTo = (next: number) => {
    const s = stage.current;
    const z = Math.max(0, Math.min(ZOOMS.length - 1, next));
    if (!s || z === zoom) return;
    const fx = (s.scrollLeft + s.clientWidth / 2) / s.scrollWidth;
    const fy = (s.scrollTop + s.clientHeight / 2) / s.scrollHeight;
    setZoom(z);
    requestAnimationFrame(() => {
      s.scrollLeft = fx * s.scrollWidth - s.clientWidth / 2;
      s.scrollTop = fy * s.scrollHeight - s.clientHeight / 2;
    });
  };
  // A tap on the dark space (or on the photo while it is not zoomed) closes it: one easy way out for everyone.
  const closeOnSpace = (e: MouseEvent) => {
    if (e.target instanceof HTMLElement && e.target.dataset.close !== undefined) dialog.current?.close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (many && e.key === "ArrowLeft") go(-1);
    else if (many && e.key === "ArrowRight") go(1);
    else if (e.key === "+" || e.key === "=") zoomTo(zoom + 1);
    else if (e.key === "-") zoomTo(zoom - 1);
  };
  // One finger, not zoomed: a sideways swipe of 50 px or more steps to the next photo. Two fingers are a pinch, never a swipe.
  const touchStart = (e: TouchEvent) => {
    swipeFrom.current = many && zoom === 0 && e.touches.length === 1 ? e.touches[0]!.clientX : null;
  };
  const touchEnd = (e: TouchEvent) => {
    const from = swipeFrom.current;
    swipeFrom.current = null;
    const dx = from === null ? 0 : e.changedTouches[0]!.clientX - from;
    if (Math.abs(dx) >= 50) go(dx < 0 ? 1 : -1);
  };

  const round = "tap-target grid size-12 shrink-0 place-items-center rounded-full";
  const soft = `${round} bg-white/15 text-white disabled:opacity-40`;
  return (
    <>
      <button type="button" onClick={open} className="absolute inset-0 block size-full cursor-zoom-in">
        {children}
        <span className="sr-only">{t`写真を大きく見る`}</span>
      </button>
      <dialog
        ref={dialog}
        onClick={closeOnSpace}
        onKeyDown={onKey}
        aria-label={photo.alt || t`写真`}
        // Black and white in both themes, not colour tokens: a photo reads best on black, and dark mode would swap paper and ink.
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 text-white"
      >
        {/* Under the status strip of an installed iPhone app a tap is taken by the system, so the top row starts below it (--top-clear). */}
        <div data-close className="flex h-full flex-col gap-2 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[calc(0.75rem+var(--top-clear))]">
          <div data-close className="flex items-center gap-2">
            {many ? (
              <p aria-live="polite" className="min-w-[4.5rem] text-lg font-bold tabular-nums">
                {at + 1} / {photos.length}
              </p>
            ) : null}
            <button type="button" aria-label={t`拡大する`} disabled={zoom === ZOOMS.length - 1} onClick={() => zoomTo(zoom + 1)} className={soft}>
              <PlusIcon size={24} />
            </button>
            <button type="button" aria-label={t`縮小する`} disabled={zoom === 0} onClick={() => zoomTo(zoom - 1)} className={soft}>
              <MinusIcon size={24} />
            </button>
            <button type="button" aria-label={t`閉じる`} onClick={() => dialog.current?.close()} className={`${round} ml-auto bg-white text-black`}>
              <XIcon size={24} />
            </button>
          </div>
          <div className="relative min-h-0 flex-1" onTouchStart={touchStart} onTouchEnd={touchEnd}>
            {/* margin:auto (not justify-center) centres the photo yet lets every edge of a zoomed one scroll into view. */}
            <div ref={stage} data-close className="flex size-full overflow-auto">
              {/* eslint-disable-next-line @next/next/no-img-element -- the same address as the photo on the page, shown whole */}
              <img
                key={photo.src}
                src={photo.src}
                alt={photo.alt}
                data-close={zoom === 0 ? "" : undefined}
                style={zoom === 0 ? undefined : { width: `${scale * 100}%`, height: `${scale * 100}%` }}
                className={`m-auto shrink-0 object-contain ${zoom === 0 ? "size-full" : "max-w-none"}`}
              />
            </div>
            {many ? (
              <>
                <button type="button" aria-label={t`前の写真`} onClick={() => go(-1)} className={`${round} absolute left-0 top-1/2 -translate-y-1/2 bg-black/55 text-white`}>
                  <ChevronLeftIcon size={28} />
                </button>
                <button type="button" aria-label={t`次の写真`} onClick={() => go(1)} className={`${round} absolute right-0 top-1/2 -translate-y-1/2 bg-black/55 text-white`}>
                  <ChevronIcon size={28} />
                </button>
              </>
            ) : null}
          </div>
          {photo.alt || photo.credit ? (
            <p data-close className="mx-auto max-w-prose text-center text-base leading-snug">
              {photo.alt}
              {photo.alt && photo.credit ? " ・ " : null}
              {photo.credit ? (
                photo.sourceUrl ? (
                  <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                    {photo.credit}
                  </a>
                ) : (
                  <CreditWords credit={photo.credit} linkClass="underline underline-offset-4" />
                )
              ) : null}
            </p>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
