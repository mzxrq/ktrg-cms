"use client";

import { useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { buttonStyle } from "@/components/button";

/** The (?) button under the zoom buttons: a short tour of the finger gestures, in words, over the map. Phones only, since these are touch gestures. */
export function MapHelp() {
  const { t } = useLingui();
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const steps: { name: string; how: string }[] = [
    { name: t`コースを見る`, how: t`コースを選ぶと、ルートとスタンプスポットが表示されます。` },
    { name: t`地図の動かす`, how: t`指1本でなぞって動かします。` },
    { name: t`拡大・縮小`, how: t`指2本で画面を広げたり狭めたり縮めたりします。` },
    { name: t`地図を傾ける`, how: t`指3本で上下になぞります。` },
    { name: t`画面を消さない`, how: t`ナビ中は画面が消えません。上の太陽ボタンで切り替えられます。電池の減りが早くなるため、長いコースでは残量にご注意ください。` },
  ];
  const current = steps[step]!;
  const last = step === steps.length - 1;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStep(0);
          dialog.current?.showModal();
        }}
        aria-label={t`地図の使い方`}
        className="tap-target inline-flex items-center justify-center rounded-full border border-ink bg-paper text-2xl font-bold text-ink hover:bg-surface wide:hidden"
      >
        ?
      </button>
      <dialog ref={dialog} aria-labelledby="map-help-title" className="m-0 h-dvh max-h-none w-full max-w-none flex-col gap-3 bg-transparent p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[calc(1rem+var(--top-clear))] open:flex backdrop:bg-black/60">
        <div className="mt-auto rounded-lg bg-paper p-5 text-ink">
          <p className="text-base font-bold tabular-nums text-muted">
            {step + 1} / {steps.length}
          </p>
          <h2 id="map-help-title" className="mt-1 text-2xl font-bold">
            {current.name}
          </h2>
          <p className="mt-2 min-h-[3.5rem] text-lg leading-snug">{current.how}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {step > 0 ? (
              <button type="button" onClick={() => setStep(step - 1)} className={buttonStyle("secondary", "md", "flex w-full")}>
                {t`戻る`}
              </button>
            ) : (
              <button type="button" onClick={() => dialog.current?.close()} className={buttonStyle("secondary", "md", "flex w-full")}>
                {t`閉じる`}
              </button>
            )}
            <button type="button" onClick={() => (last ? dialog.current?.close() : setStep(step + 1))} className={buttonStyle("primary", "md", "flex w-full")}>
              {last ? t`閉じる` : t`次へ`}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
