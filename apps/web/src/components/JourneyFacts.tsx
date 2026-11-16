import { useLingui } from "@lingui/react/macro";
import { walkTime, type JourneyFacts as Facts } from "@/lib/rally-journey";
import { Walker } from "./Walker";

/**
 * What a visitor who has not started a rally wants to know first: how big the walk is (places, trail length, time), the
 * walker standing at the start of a dotted path, and an invitation. Shown in place of "0 / N, no stamps yet".
 */
export function JourneyFacts({ facts }: { facts: Facts }) {
  const { t } = useLingui();
  const total = facts.places;
  const time = facts.minutes === null ? null : walkTime(facts.minutes);
  const h = time?.hours ?? 0;
  const m = time?.minutes ?? 0;
  const timeText = time === null ? null : h > 0 && m > 0 ? t`約${h}時間${m}分` : h > 0 ? t`約${h}時間` : t`約${m}分`;
  const tile = "rounded-xl bg-paper px-1 py-2 text-center";
  const big = "block whitespace-nowrap text-lg font-bold leading-tight tabular-nums";
  // The time is the longest, so it gets a wider tile; a number and its unit never split across lines.
  const columns = [1, facts.km !== null ? 1 : 0, timeText !== null ? 1.5 : 0].filter(Boolean).map((w) => `minmax(0,${w}fr)`).join(" ");

  return (
    <div className="flex flex-col gap-3">
      <ul className="grid gap-2" style={{ gridTemplateColumns: columns }}>
        <li className={tile}>
          <b className={big}>{total}{t`か所`}</b>
          <span className="text-base text-muted">{t`スタンプ`}</span>
        </li>
        {facts.km !== null ? (
          <li className={tile}>
            <b className={big}>{facts.km} km</b>
            <span className="text-base text-muted">{t`の道のり`}</span>
          </li>
        ) : null}
        {timeText !== null ? (
          <li className={tile}>
            <b className={big}>{timeText}</b>
            <span className="text-base text-muted">{t`歩く時間`}</span>
          </li>
        ) : null}
      </ul>
      {/* The walker at the start of the path; the last stamp waits, dashed, at the other end. */}
      <div aria-hidden="true" className="relative h-10">
        <div className="absolute inset-x-2 top-[34px] border-t-[3px] border-dotted border-line" />
        <Walker className="absolute left-1 top-0 h-9 text-moss" />
        <span className="absolute right-1 top-[26px] size-4 rounded-full border-2 border-dashed border-line" />
      </div>
      <p className="text-lg">{t`さあ、最初の一歩へ。${total}か所のスタンプが待っています。`}</p>
    </div>
  );
}
