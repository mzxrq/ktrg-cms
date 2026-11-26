"use client";

import Link from "next/link";
import { Trans, useLingui } from "@lingui/react/macro";
import { StatusWord } from "@/components/StatusWord";
import type { SpotStatus } from "@/lib/content";
import { WarningIcon, XIcon } from "@/components/icons";
import { buttonStyle } from "@/components/button";
import type { FlyStop } from "@/lib/fly-along";

/** The small card shown over the map (at its bottom) when a stop is tapped. The full sheet is its own page. */
export function StopCard({
  order,
  name,
  nameLang,
  status,
  href,
  noStamp = false,
  draft,
  onClose,
  bare = false,
  fly,
}: {
  /** null for a side trip (寄り道): no number. */
  order: number | null;
  name: string;
  nameLang: "ja" | "en";
  status: SpotStatus;
  href: string;
  /** A place where no stamp can be collected. */
  noStamp?: boolean;
  draft: boolean;
  /** Given when the card lies over the map: a close button at its corner. */
  onClose?: () => void;
  /** Inside the map's stepper, which already shows the name (user, 2026-11-26): no frame and no name; ✕ beside the status. */
  bare?: boolean;
  /** What the fly-along shows here (lib/fly-along.ts): its photo, its short line, and 寄り道におすすめ for a side trip. The
   *  stepper's card is the fly-along's card too (user, 2026-11-26: no second card). */
  fly?: FlyStop;
}) {
  const { t } = useLingui();
  const close = onClose ? (
    <button type="button" onClick={onClose} aria-label={t`閉じる`} className="tap-target -mr-2 -mt-2 inline-flex shrink-0 items-center justify-center">
      <XIcon />
    </button>
  ) : null;
  return (
    <div className={bare ? "flex flex-col gap-2" : "flex flex-col gap-2 rounded-xl border-2 border-line bg-paper p-3"} role="status">
      {bare ? null : (
        <div className="flex items-start justify-between gap-2">
          <p className="text-xl font-bold leading-snug">
            {order === null ? "" : `${order}. `}<span lang={nameLang}>{name}</span>
          </p>
          {close}
        </div>
      )}
      <div className="flex gap-3">
        {fly?.photo ? (
          // A photo from our own storage or a listed host (checked on save); next/image would need every host configured.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fly.photo} alt="" className="size-24 shrink-0 rounded-lg object-cover" />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-start justify-between gap-2">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-lg">
              <StatusWord status={status} />
              {noStamp ? (
                <span className="rounded-lg border-2 border-dashed border-line px-2 text-base font-bold">
                  <Trans>スタンプなし</Trans>
                </span>
              ) : null}
            </p>
            {bare ? close : null}
          </div>
          {fly?.recommended ? (
            <span className="self-start rounded-full bg-surface px-2 text-base font-bold text-accent">
              <Trans>寄り道におすすめ</Trans>
            </span>
          ) : null}
          {fly?.note ? (
            <p lang={fly.noteLang} className="line-clamp-3 text-base">
              {fly.note}
            </p>
          ) : null}
          {draft ? (
            <p className="flex items-start gap-2 text-base text-muted">
              <span className="shrink-0 text-caution">
                <WarningIcon />
              </span>
              <Trans>位置情報は未確認です（仮の位置を表示しています）。</Trans>
            </p>
          ) : null}
          <Link
            href={href}
            className={buttonStyle("primary", "md", "inline-flex self-start")}
          >
            <Trans>詳細を見る</Trans>
          </Link>
        </div>
      </div>
    </div>
  );
}
