"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { MotionSelect } from "./MotionSelect";
import { persistPrefs } from "@/lib/prefs-client";
import { setSound, useSound } from "@/lib/stamp-feel";
import type { Prefs } from "@/lib/prefs";

type Toggle = "furigana" | "contrast";

/** One row of the menu's list: the words on the left, the switch on the right (the same row as the settings page). */
export function SwitchRow({ label, on, set }: { label: string; on: boolean; set: (value: boolean) => void }) {
  return (
    <label className="tap-target flex cursor-pointer items-center gap-4 px-4 py-3">
      <span className="min-w-0 flex-1 text-lg font-bold">{label}</span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => set(e.target.checked)} className="shrink-0" />
    </label>
  );
}

/**
 * The accessibility choices people reach for most as five switch rows (larger text, furigana, bold display, less motion, sound). They sit in the
 * menu's list and change the page at once; the full list is in the settings. The parent owns the panel they sit in.
 */
export function QuickActions({ prefs, signedIn }: { prefs: Prefs; signedIn: boolean }) {
  const { t } = useLingui();
  const router = useRouter();
  const [current, setCurrent] = useState(prefs);
  const sound = useSound();

  async function change(next: Prefs) {
    setCurrent(next);
    const { dataset } = document.documentElement;
    dataset.size = next.size;
    for (const key of ["contrast", "calm", "furigana"] as const) {
      if (next[key]) dataset[key] = "";
      else delete dataset[key];
    }
    if (next.fade && !next.calm) dataset.fade = "";
    else delete dataset.fade;
    await persistPrefs(next, signedIn);
    router.refresh();
  }
  const flip = (key: Toggle, value: boolean) => current[key] !== value && change({ ...current, [key]: value });
  const grown = current.size === "large" || current.size === "xlarge";

  return (
    <>
      <SwitchRow label={t`文字を大きくする`} on={grown} set={(on) => change({ ...current, size: on ? "large" : "standard" })} />
      <SwitchRow label={t`ふりがなをつける`} on={current.furigana} set={(on) => flip("furigana", on)} />
      <SwitchRow label={t`くっきり表示`} on={current.contrast} set={(on) => flip("contrast", on)} />
      <div className="tap-target flex items-center gap-4 px-4 py-3">
        <span className="min-w-0 flex-1 text-lg font-bold">{t`動き`}</span>
        <MotionSelect prefs={current} onChange={change} />
      </div>
      {/* The stamp sound: kept on this device only, off until chosen. */}
      <SwitchRow label={t`音`} on={sound} set={setSound} />
    </>
  );
}
