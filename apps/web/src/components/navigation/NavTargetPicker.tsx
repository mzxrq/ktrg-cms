"use client";

import { useRef, type MouseEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import { distanceM } from "@/lib/navigation/geometry";
import { distanceParts } from "@/lib/stamp-flow";
import { useNavigation } from "./NavigationProvider";
import { buttonStyle } from "@/components/button";
import { offersNoStamp } from "@/lib/spot-status";
import { TickIcon } from "@/components/icons";

/**
 * 「ほかの場所へ向かう」: pick any stop still to stamp as the target instead of the nearest one (to skip one on purpose, or to
 * head for the one you want). A stop you stamp hands the choice back to the nearest; 「近い順にもどす」 does it by hand.
 */
export function NavTargetPicker() {
  const { t, i18n } = useLingui();
  const { session, setTarget } = useNavigation();
  const dialog = useRef<HTMLDialogElement>(null);
  if (!session) return null;
  const { snapshot: snap, model } = session;
  const left = model.stops.filter((s) => !snap.stamped.has(s.id));
  if (left.length === 0) return null;
  const fmt = new Intl.NumberFormat(i18n.locale === "ja" ? "ja-JP" : "en-US", { maximumFractionDigits: 1 });
  const away = (s: { lat: number; lng: number }) => {
    if (!snap.position) return "";
    const d = distanceParts(distanceM(snap.position, s));
    const v = fmt.format(d.value);
    return d.unit === "km" ? t`${v}km` : t`${v}m`;
  };
  const pick = (id: string | null) => {
    setTarget(id);
    dialog.current?.close();
  };
  // A tap on the dimmed map lands on the dialog itself, not on anything inside it.
  const closeOnBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) dialog.current?.close();
  };
  const row = "tap-target flex w-full items-center justify-between gap-3 rounded-full border border-ink px-4 py-2 text-left text-lg font-bold hover:bg-surface disabled:opacity-60";

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={buttonStyle("secondary", "md", "flex w-full")}>
        {t`目的地を変更`}
        {snap.forcedId ? (
          <>
            <TickIcon size={22} />
            <span className="sr-only">{t`選択中`}</span>
          </>
        ) : null}
      </button>
      {/* Rule 1 (docs/navigation-v2-plan.md): the title and the buttons stay put; only the list scrolls between them.
          N2-6: on a phone a sheet from the bottom (in thumb reach, sliding up: .nav-sheet in globals.css), from 768 px a
          centred box. A tap on the dimmed map above it closes it (the click lands on the dialog itself, not its content). */}
      <dialog
        ref={dialog}
        aria-labelledby="nav-target-title"
        onClick={closeOnBackdrop}
        className="nav-sheet mx-0 mb-0 mt-auto max-h-[85dvh] w-full max-w-none flex-col overflow-hidden rounded-t-3xl bg-paper text-ink backdrop:bg-black/60 open:flex md:m-auto md:w-[calc(100%-2rem)] md:max-w-sm md:rounded-lg"
      >
        <h2 id="nav-target-title" className="shrink-0 px-5 pt-5 text-2xl font-bold">
          {t`目的地を選ぶ`}
        </h2>
        <ul className="mt-4 flex min-h-0 flex-col gap-2 overflow-y-auto px-5 pb-1">
          {left.map((s) => {
            const info = session.stops[s.id];
            const closed = offersNoStamp(s.status);
            const now = snap.state.targetId === s.id;
            return (
              <li key={s.id}>
                <button type="button" disabled={closed || now} onClick={() => pick(s.id)} className={row}>
                  <span className="min-w-0">
                    <span lang={info?.nameLang} className="block">
                      {info?.name ?? ""}
                    </span>
                    <span className="block text-base font-normal text-muted">{closed ? t`閉鎖中` : now ? t`現在の目的地` : away(s)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div data-nav-footer className="flex shrink-0 flex-col gap-2 border-t border-line px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] pt-4 md:pb-5">
          {snap.forcedId ? (
            <button type="button" onClick={() => pick(null)} className={buttonStyle("primary", "lg", "flex w-full")}>
              {t`近い順に戻す`}
            </button>
          ) : null}
          <button type="button" onClick={() => dialog.current?.close()} className={buttonStyle("secondary", "lg", "flex w-full")}>
            {t`閉じる`}
          </button>
        </div>
      </dialog>
    </>
  );
}
