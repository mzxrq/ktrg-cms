"use client";

import { useLingui } from "@lingui/react/macro";
import { isTechnicalLevel, physicalStars, STAR_COUNT, suggestPhysicalLevel, technicalStars, TECHNICAL_LEVELS, type TechnicalLevel } from "@/lib/grading";
import { Field, inputClass } from "./fields";

/** "★★☆☆☆": the stars a visitor sees, as text (a select's options cannot hold pictures). */
const starText = (n: number) => "★".repeat(n) + "☆".repeat(STAR_COUNT - n);

interface GradingDraft {
  physicalLevel: number | null;
  technicalLevel: TechnicalLevel | null;
  distanceKm: number | null;
  expectedTimeMin: number | null;
  elevationGainM: number | null;
}

/**
 * The two grading levels of a route, in the visitors' words and stars (体力の目安, 道のけわしさ; 2026-11-16). The physical
 * level (1 to 10, two to a star) is suggested from the numbers above (the course constant, see lib/grading.ts) and the editor
 * decides what is saved; all ten stay choosable, with the level after the stars, so a saved level is never rounded. The
 * technical level (A to E, one star each) is chosen by hand, from what the ground is like.
 */
export function GradingFields({
  draft,
  descentM,
  onPhysical,
  onTechnical,
}: {
  draft: GradingDraft;
  /** Metres walked downhill, from the line's elevations; null when the line has none. */
  descentM: number | null;
  onPhysical: (level: number | null) => void;
  onTechnical: (level: TechnicalLevel | null) => void;
}) {
  const { t } = useLingui();
  const suggestion = suggestPhysicalLevel({ ...draft, descentM });
  const constant = suggestion ? suggestion.constant.toFixed(1) : "";
  const level = suggestion?.level ?? 0;

  const technicalHints: Record<TechnicalLevel, string> = {
    A: t`整備された道で、迷いにくく、転んでも大きな事故になりにくい。`,
    B: t`急な登り下りや、わかりにくい所がある。はしごやくさりが出ることもある。`,
    C: t`転落・滑落の危険がある所がある。地図を読む力と、ミスをしない注意が必要。`,
    D: t`岩場やガレ場、手を使う急な登り下りがある。道がわかりにくい所も多い。`,
    E: t`厳しい岩場や藪こぎが続く。道を自分で見つける技術と、高い判断力が必要。`,
  };

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field
        label={t`体力の目安`}
        htmlFor="route-physical"
        hint={
          suggestion
            ? t`目安：コース定数 ${constant} → ${starText(physicalStars(level))}（${level}）`
            : t`距離と時間を入れると、目安が出ます`
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <select
            id="route-physical"
            value={draft.physicalLevel ?? ""}
            onChange={(e) => onPhysical(e.target.value === "" ? null : Number(e.target.value))}
            className={`${inputClass} w-auto min-w-48`}
          >
            <option value="">{t`選ばない`}</option>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const stars = physicalStars(n);
              return (
                <option key={n} value={n}>
                  {`${starText(stars)} ${t`星${stars}つ（${n}）`}`}
                </option>
              );
            })}
          </select>
          {suggestion && suggestion.level !== draft.physicalLevel ? (
            <button type="button" onClick={() => onPhysical(suggestion.level)} className="tap-target rounded-full border border-line px-3 text-base font-bold">
              {t`目安を使う`}
            </button>
          ) : null}
        </div>
      </Field>

      <div className="sm:col-span-2">
      <Field
        label={t`道のけわしさ`}
        htmlFor="route-technical"
        hint={draft.technicalLevel ? technicalHints[draft.technicalLevel] : t`道の状態から、手で選びます。`}
      >
        <select
          id="route-technical"
          value={draft.technicalLevel ?? ""}
          onChange={(e) => onTechnical(isTechnicalLevel(e.target.value) ? e.target.value : null)}
          className={`${inputClass} w-auto min-w-48`}
        >
          <option value="">{t`選ばない`}</option>
          {TECHNICAL_LEVELS.map((l) => {
            const stars = technicalStars(l);
            return (
              <option key={l} value={l}>
                {`${starText(stars)} ${t`星${stars}つ`}`}
              </option>
            );
          })}
        </select>
      </Field>
      </div>
    </div>
  );
}
