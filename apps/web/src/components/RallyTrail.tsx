import Link from "next/link";
import { useLingui } from "@lingui/react/macro";
import { pickText } from "@/lib/content";
import { isDone, trailStops, walkerAt, type TrailPlace } from "@/lib/rally-trail";
import { RoutePhoto } from "./RoutePhoto";
import { StatusWord } from "./StatusWord";
import { Walker } from "./Walker";

const textOf = (locale: string, ja: string | null, en: string | null) => (ja === null ? null : (pickText(locale, ja, en)?.text ?? ja));

/**
 * The whole rally as one path: a dotted line down the page, a card for each place (photo, name, a short line, its status)
 * and the walker standing at the next place. Plain markup, no motion (the walker's journey comes with the motion stage).
 * A place opens its own page, where the stamp is pressed.
 */
export function RallyTrail({ places, held, locale }: { places: readonly TrailPlace[]; held: ReadonlySet<string>; locale: string }) {
  const { t } = useLingui();
  const stops = trailStops(places, held);
  const at = walkerAt(stops);
  const allDone = stops.length > 0 && stops.every((s) => isDone(s.state) || s.state === "info");

  return (
    <ol className="relative flex flex-col gap-4">
      {/* The path itself, behind the round markers. */}
      <span aria-hidden="true" className="absolute bottom-6 left-[1.375rem] top-6 border-l-[3px] border-dotted border-line" />
      {stops.map((s, i) => {
        const name = textOf(locale, s.nameJa, s.nameEn) ?? s.nameJa;
        const line = textOf(locale, s.descriptionJa, s.descriptionEn);
        const next = s.state === "next";
        const marker =
          s.state === "stamped"
            ? "bg-shu text-on-shu"
            : s.state === "info" || s.state === "closed"
              ? "border-2 border-line bg-paper text-muted"
              : next
                ? "border-[3px] border-accent bg-paper text-accent"
                : "border-2 border-dashed border-line bg-paper text-muted";
        // A closed place has no word here: its status line below already says 通行止め.
        const stateWord = s.state === "stamped" ? t`押した` : next ? t`つぎ` : s.state === "todo" ? t`まだ` : null;
        return (
          <li key={s.id} className="relative flex gap-3">
            <div className="relative z-10 flex w-11 shrink-0 flex-col items-center">
              {i === at && !allDone ? <Walker data-trail-walker="" className="mb-1 h-9 text-moss" /> : null}
              <span aria-hidden="true" data-marker="" className={`flex size-11 items-center justify-center rounded-full text-lg font-bold tabular-nums ${marker}`}>
                {s.number ?? "i"}
              </span>
            </div>
            <Link
              href={`/spots/${s.id}`}
              data-stop={s.id}
              className={`block min-w-0 flex-1 overflow-hidden rounded-lg bg-surface ${next ? "border-[3px] border-accent" : "border border-line/40"}`}
            >
              <div className={`relative ${next ? "aspect-[16/9]" : "aspect-[16/6]"}`}>
                <RoutePhoto src={s.photoUrl} alt={name} />
              </div>
              <div className="flex flex-col gap-1 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="min-w-0 text-lg font-bold leading-snug">{name}</h3>
                  {stateWord ? <span className={`shrink-0 text-base font-bold ${s.state === "stamped" ? "text-moss" : next ? "text-accent" : "text-muted"}`}>{stateWord}</span> : null}
                </div>
                {line ? <p className="text-base leading-snug text-muted">{line}</p> : null}
                {s.status !== "open" ? (
                  <p className="text-base">
                    <StatusWord status={s.status} />
                  </p>
                ) : null}
              </div>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
