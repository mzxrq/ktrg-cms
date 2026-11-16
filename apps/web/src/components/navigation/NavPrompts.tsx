"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useLingui } from "@lingui/react/macro";
import { buttonStyle } from "@/components/button";
import { WarningIcon } from "@/components/icons";
import { CreditCaption } from "@/components/PhotoCredit";
import type { MapPhoto } from "@/lib/map-screen";
import { useEnter } from "@/lib/motion";

// The two moments a navigation stops to ask something, as cards in the middle of the screen: at a stamp place, and just past one.
// Rule 1 of docs/navigation-v2-plan.md: the buttons sit in a footer that is always on screen (data-nav-footer); only the middle
// may scroll, and on a short screen the photo gives way first (nav-dialogs.test.ts checks this).

const CARD = "w-full max-w-sm rounded-2xl bg-paper p-5 text-ink shadow-2xl";
const COVER = "fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4";
/** Long enough to read and answer with a walking pole in one hand. */
const PASSED_WAIT_S = 20;

// Not in TypeScript's DOM types yet (Chrome 120+, Android's back gesture and button; elsewhere it does not exist).
type CloseWatcherLike = { onclose: (() => void) | null; destroy(): void };
type CloseWatcherCtor = new () => CloseWatcherLike;

/**
 * Android's back closes the card instead of leaving the map (N2-2, docs/navigation-v2-plan.md). A dialog element opened with
 * showModal() gets this from the browser; these cards are plain boxes, so they ask for it. Without CloseWatcher: nothing.
 */
function useBackCloses(onBack: () => void) {
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  }, [onBack]);
  useEffect(() => {
    const Ctor = (window as unknown as { CloseWatcher?: CloseWatcherCtor }).CloseWatcher;
    if (!Ctor) return;
    let watcher: CloseWatcherLike;
    try {
      watcher = new Ctor();
    } catch {
      return;
    }
    watcher.onclose = () => latest.current();
    return () => watcher.destroy();
  }, []);
}

/**
 * At a stamp place (N2-4, docs/navigation-v2-plan.md): the navigation strip itself shows the arrival, with a small photo, and
 * the stamp button comes right under it. No card over the map, so there is nothing to put away ("later" is gone): the button
 * stays while the walker is within the place's radius. Announced once (role="status").
 */
export function ArrivalStrip({ name, nameLang, photo }: { name: string; nameLang: "ja" | "en"; photo: MapPhoto | null }) {
  const { t } = useLingui();
  const ref = useEnter<HTMLDivElement>("rise");
  return (
    <div ref={ref} role="status" className="flex items-center gap-3">
      {/* With no photo the night ground with the 七宝 pattern, as on a course's banner, so every arrival looks the same. */}
      <div className="pattern-shippo pattern-on-night relative size-16 shrink-0 overflow-hidden rounded-lg bg-night [@media(max-height:34rem)]:hidden">
        {photo ? <Image src={photo.src} alt={photo.alt} fill sizes="4rem" className="object-cover" unoptimized={photo.src.startsWith("https://")} /> : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-bold leading-tight text-accent">{t`着きました`}</p>
        <p lang={nameLang} className="font-serif text-2xl font-bold leading-snug">
          {name}
        </p>
        <CreditCaption credit={photo?.credit} className="[@media(max-height:34rem)]:hidden" />
      </div>
    </div>
  );
}

/** Before ending a navigation. Going on comes first, so a second tap in the same place cannot end the walk by mistake. */
export function EndPrompt({ onEnd, onKeep }: { onEnd: () => void; onKeep: () => void }) {
  const { t } = useLingui();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} aria-labelledby="nav-end" onClose={onKeep} className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl bg-paper p-5 text-ink shadow-2xl backdrop:bg-black/50 open:flex">
      <div className="flex min-h-0 items-start gap-3 overflow-y-auto">
        <span className="mt-0.5 shrink-0 text-caution">
          <WarningIcon />
        </span>
        <div className="min-w-0">
          <h2 id="nav-end" className="text-2xl font-bold leading-snug">
            {t`ナビを終えますか？`}
          </h2>
          <p className="mt-2 text-lg leading-snug">{t`押したスタンプは消えません。`}</p>
        </div>
      </div>
      <div data-nav-footer className="mt-4 flex shrink-0 flex-col gap-2">
        <button type="button" autoFocus onClick={onKeep} className={buttonStyle("primary", "md", "flex w-full")}>
          {t`ナビをつづける`}
        </button>
        <button type="button" onClick={onEnd} className={buttonStyle("secondary", "md", "flex w-full")}>
          {t`ナビを終える`}
        </button>
      </div>
    </dialog>
  );
}

/** Just past a stamp place without stamping. Nobody has to answer: after a moment the walk simply goes on to the next one. */
export function PassedPrompt({ name, nameLang, onGoOn, onGoBack }: { name: string; nameLang: "ja" | "en"; onGoOn: () => void; onGoBack: () => void }) {
  const { t } = useLingui();
  // The dimmed cover fades in and the card rises (lib/motion; none at the level Off).
  const coverRef = useEnter<HTMLDivElement>("fade");
  const cardRef = useEnter<HTMLElement>("rise");
  useBackCloses(onGoOn); // back = what happens anyway after the countdown
  const [left, setLeft] = useState(PASSED_WAIT_S);
  const goOn = useRef(onGoOn);
  useEffect(() => {
    goOn.current = onGoOn;
  }, [onGoOn]);
  // Counted from the clock, not from ticks: a phone in a pocket slows timers down.
  useEffect(() => {
    const ends = Date.now() + PASSED_WAIT_S * 1000;
    const id = setInterval(() => {
      const s = Math.ceil((ends - Date.now()) / 1000);
      setLeft(Math.max(0, s));
      if (s <= 0) {
        clearInterval(id);
        goOn.current();
      }
    }, 500);
    return () => clearInterval(id);
  }, []);
  return (
    <div ref={coverRef} className={COVER}>
      <section ref={cardRef} role="alertdialog" aria-modal="true" aria-labelledby="nav-passed" className={`${CARD} flex max-h-full flex-col gap-3 overflow-hidden`}>
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <h2 id="nav-passed" className="text-xl font-bold leading-snug">
            <span lang={nameLang}>{name}</span>
            {t`を通りすぎました`}
          </h2>
          <p className="text-lg leading-snug">{t`次の場所へ進みますか？`}</p>
        </div>
        <div data-nav-footer className="flex shrink-0 flex-col gap-3">
        <button type="button" onClick={onGoOn} className={buttonStyle("action", "lg", "flex w-full tabular-nums")}>
          {t`次へ進む（${left}秒）`}
        </button>
        <button type="button" onClick={onGoBack} className={buttonStyle("secondary", "md", "flex w-full")}>
          {t`もどる`}
        </button>
        </div>
      </section>
    </div>
  );
}
