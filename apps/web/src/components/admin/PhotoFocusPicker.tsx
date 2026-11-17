"use client";

import type { KeyboardEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import { photoLinkLooksValid } from "@/lib/admin/save-plan";
import { focusAt, focusStyle, type PhotoFocus } from "@/lib/photo-focus";

const STEP = 5;

/**
 * Where the middle of the course photo is: the whole photo is shown, and a click (or a tap) on it puts the middle there;
 * the arrow keys move it in steps of 5%. Two small frames show how the wide cover and a square card will crop it.
 * Nothing is drawn until the photo link is usable.
 */
export function PhotoFocusPicker({ url, focus, onChange }: { url: string; focus: PhotoFocus | null; onChange: (focus: PhotoFocus | null) => void }) {
  const { t } = useLingui();
  const src = url.trim();
  if (src === "" || !photoLinkLooksValid(src)) return null;
  const at = focus ?? { x: 50, y: 50 };
  const key = (e: KeyboardEvent<HTMLButtonElement>) => {
    const move: Record<string, [number, number]> = { ArrowLeft: [-STEP, 0], ArrowRight: [STEP, 0], ArrowUp: [0, -STEP], ArrowDown: [0, STEP] };
    const d = move[e.key];
    if (!d) return;
    e.preventDefault();
    const clamp = (v: number) => Math.min(100, Math.max(0, v));
    onChange({ x: clamp(at.x + d[0]), y: clamp(at.y + d[1]) });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-muted">{t`写真の中で、いちばん見せたいところを押してください。横長の表紙や四角いカードで切り取られても、そこが残ります。`}</p>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <button
          type="button"
          onClick={(e) => onChange(focusAt(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect()))}
          onKeyDown={key}
          aria-label={t`写真の中心を決める。いまは左から${at.x}%、上から${at.y}%。矢印キーでも動かせます。`}
          className="relative block w-full max-w-md cursor-crosshair overflow-hidden rounded-xl"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- an editor's preview of the course photo, any allowed host */}
          <img src={src} alt="" referrerPolicy="no-referrer" className="block h-auto w-full" />
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute size-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-paper shadow-[0_0_0_2px_var(--color-ink)] ${focus ? "bg-brand/60" : "bg-transparent"}`}
            style={{ left: `${at.x}%`, top: `${at.y}%` }}
          />
        </button>
        <div className="flex flex-col gap-2" aria-hidden="true">
          <p className="text-base font-bold">{t`切り取られたときの見え方`}</p>
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
            <img src={src} alt="" referrerPolicy="no-referrer" className="aspect-video w-48 rounded-lg object-cover" style={focusStyle(at)} />
            {/* eslint-disable-next-line @next/next/no-img-element -- as above */}
            <img src={src} alt="" referrerPolicy="no-referrer" className="aspect-square w-24 rounded-lg object-cover" style={focusStyle(at)} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-base" aria-live="polite">
          {focus ? t`中心：左から${at.x}%、上から${at.y}%` : t`中心：まんなか（決めていません）`}
        </p>
        {focus ? (
          <button type="button" onClick={() => onChange(null)} className="tap-target rounded-full border border-line px-4 text-base font-bold">
            {t`まんなかに戻す`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
