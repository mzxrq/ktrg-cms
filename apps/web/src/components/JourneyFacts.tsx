import { useLingui } from "@lingui/react/macro";
import { walkTime, type JourneyFacts as Facts } from "@/lib/rally-journey";
import { Walker } from "./Walker";

/**
 * What a visitor who has not started a rally wants to know first: how big the walk is (places, trail length, time), the
 * walker standing at the start of a dotted path, and an invitation. Shown in place of "0 / N, no stamps yet".
 */
export function JourneyFacts({ facts, compact = false }: { facts: Facts; compact?: boolean }) {
  const { t } = useLingui();
  const total = facts.places;
  const time = facts.minutes === null ? null : walkTime(facts.minutes);
  const h = time?.hours ?? 0;
  const m = time?.minutes ?? 0;
  const timeText = time === null ? null : h > 0 && m > 0 ? t`約${h}時間${m}分` : h > 0 ? t`約${h}時間` : t`約${m}分`;
  // Tiles wrap onto a second line rather than squeeze: English "31 places" or "111.6 km" does not fit a third of a phone.
  const tile = "min-w-[6.5rem] flex-1 rounded-xl bg-paper px-1 py-2 text-center";
  // Wraps at spaces (English "About 64 h 30 min" is wider than a phone tile); a number and its unit are held together
  // by a no-break space in the messages, so they never split across lines.
  const big = "block text-lg font-bold leading-tight tabular-nums";

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-2">
        <li className={tile}>
          <b className={big}>{t`${total}か所`}</b>
          <span className="text-base text-muted">{t`スタンプ`}</span>
        </li>
        {facts.km !== null ? (
          <li className={tile}>
            <b className={big}>{facts.km} km</b>
            <span className="text-base text-muted">{t`の道のり`}</span>
          </li>
        ) : null}
        {timeText !== null ? (
          <li className={`${tile} grow-[1.5]`}>
            <b className={big}>{timeText}</b>
            <span className="text-base text-muted">{t`歩く時間`}</span>
          </li>
        ) : null}
      </ul>
      {compact ? null : (
        <>
          {/* The walker at the start of the path; the last stamp waits, dashed, at the other end. */}
          <div aria-hidden="true" className="relative h-10">
            <div className="absolute inset-x-2 top-[34px] border-t-[3px] border-dotted border-line" />
            <Walker className="absolute left-1 top-0 h-9 text-moss" />
            <span className="absolute right-1 top-[26px] size-4 rounded-full border-2 border-dashed border-line" />
          </div>
          <p className="text-lg">{t`さあ、最初の一歩へ。このラリーのスタンプは、全部で${total}か所です。`}</p>
        </>
      )}
    </div>
  );
}
