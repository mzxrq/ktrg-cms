"use client";

import { useLingui } from "@lingui/react/macro";
import { motionOf, withMotion, type MotionPref, type Prefs } from "@/lib/prefs";

/** The motion level as a drop-down (full, fade only, none), the same plain pill as the theme and language in the menu. */
export function MotionSelect({ prefs, onChange }: { prefs: Prefs; onChange: (next: Prefs) => void }) {
  const { t } = useLingui();
  return (
    <select
      aria-label={t`動き`}
      value={motionOf(prefs)}
      onChange={(e) => onChange(withMotion(prefs, e.target.value as MotionPref))}
      className="min-h-12 rounded-xl border border-line bg-paper px-3.5 text-base font-bold text-ink hover:bg-surface"
    >
      <option value="full">{t`ふつうに動く`}</option>
      <option value="fade">{t`フェードだけ`}</option>
      <option value="off">{t`動かさない`}</option>
    </select>
  );
}
