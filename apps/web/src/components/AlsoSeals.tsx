"use client";

import { useLingui } from "@lingui/react/macro";
import { StampFace } from "./StampFace";

// The seal lands in 450 ms (globals.css .stamp-land); each further one waits for the one before.
const LAND_MS = 450;

/** How much longer the progress popup and moving on wait so the extra seals are seen landing (none: no wait). */
export const alsoSealsMs = (count: number) => (count > 0 ? count * LAND_MS + 300 : 0);

/**
 * The other stamps one press gave (遥拝, or a closed place's 閉鎖時のスタンプ地点): one seal after another, each with its
 * place's name, starting once the main press is done (`startMs`; user, 2026-11-27). With reduced motion they simply show.
 */
export function AlsoSeals({ also, startMs = 0 }: { also: { nameJa: string; nameEn: string | null }[]; startMs?: number }) {
  const { t, i18n } = useLingui();
  return also.map((a, i) => {
    const name = i18n.locale === "ja" ? a.nameJa : (a.nameEn ?? a.nameJa);
    return (
      <div key={a.nameJa} className="flex items-center gap-4 px-4">
        <span className="stamp-land inline-flex shrink-0" style={{ animationDelay: `${startMs + LAND_MS * i}ms` }}>
          <StampFace state="stamped" rough className="h-12 w-12" />
        </span>
        <p className="text-lg leading-snug">{t`「${name}」のスタンプも押しました。`}</p>
      </div>
    );
  });
}
