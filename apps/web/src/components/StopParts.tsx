import { Trans } from "@lingui/react/macro";
import { WarningIcon } from "./icons";
import { StampFace } from "./StampFace";

// The pieces every stop view shows (the stop page, the course map's card, the big map's panel, the course's stop list):
// one copy each, so a word changed here changes everywhere.

/** A place where no stamp can be collected. */
export function NoStampChip({ className = "" }: { className?: string }) {
  return (
    <span className={`rounded-lg border-2 border-dashed border-line px-2 text-base font-bold ${className}`}>
      <Trans>スタンプなし</Trans>
    </span>
  );
}

/** The course's positions are not checked yet: the pins stand where they are for now. */
export function DraftPositionNote() {
  return (
    <p className="flex items-start gap-2 text-base text-muted">
      <span className="shrink-0 text-caution">
        <WarningIcon />
      </span>
      <Trans>位置情報は未確認です（仮の位置を表示しています）。</Trans>
    </p>
  );
}

/** The stamp of a stamp place: the stamp itself once collected (2026-11-18, user), else how to collect it. */
export function StampCard({ stamped, image, number, className = "" }: { stamped: boolean; image?: string | null; number?: number; className?: string }) {
  return (
    <section className={`flex items-center gap-4 rounded-lg bg-surface p-4 ${className}`}>
      <StampFace state={stamped ? "stamped" : "empty"} image={image} number={number} className="h-14 w-14 shrink-0 rounded-full!" />
      {stamped ? (
        <div>
          <p className="text-xl font-bold text-moss">
            <Trans>スタンプ獲得済み</Trans>
          </p>
          <p className="text-lg text-muted">
            <Trans>スタンプ帳に記録されています。</Trans>
          </p>
        </div>
      ) : (
        <div>
          <p className="text-xl font-bold">
            <Trans>スタンプスポット</Trans>
          </p>
          <p className="text-lg text-muted">
            <Trans>現地付近でボタンを押して獲得（位置情報を使用）</Trans>
          </p>
        </div>
      )}
    </section>
  );
}
