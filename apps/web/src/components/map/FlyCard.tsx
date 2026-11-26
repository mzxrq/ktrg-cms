"use client";

import Link from "next/link";
import { useLingui } from "@lingui/react/macro";
import { StatusWord } from "@/components/StatusWord";
import { buttonStyle } from "@/components/button";
import type { FlyStop } from "@/lib/fly-along";
import type { MapStop } from "./TrailMap";

/**
 * The card the fly-along shows while it pauses at a waypoint (2026-11-26, user): its photo, name, state and short line, as
 * admin set them (lib/fly-along.ts flyStopOf). 次へ goes on before its seconds are up; 詳細を見る opens its page, which
 * ends the flight. A side trip or a place off the line is marked as worth a visit.
 */
export function FlyCard({ stop, fly, onNext }: { stop: MapStop; fly: FlyStop; onNext: () => void }) {
  const { t } = useLingui();
  return (
    <div role="status" className="order-0 flex gap-3 rounded-xl border-2 border-line bg-paper p-3 shadow-md @4xl:order-none @4xl:max-w-xl">
      {fly.photo ? (
        // A photo from our own storage or a listed host (checked on save); next/image would need every host configured.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fly.photo} alt="" className="size-24 shrink-0 rounded-lg object-cover" />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {fly.recommended ? (
          <span className="self-start rounded-full bg-surface px-2 text-base font-bold text-accent">{t`寄り道におすすめ`}</span>
        ) : null}
        <p className="text-xl font-bold leading-snug">
          {stop.order === null ? "" : `${stop.order}. `}
          <span lang={stop.nameLang}>{stop.name}</span>
        </p>
        <p className="text-lg">
          <StatusWord status={stop.status} />
        </p>
        {fly.note ? (
          <p lang={fly.noteLang} className="line-clamp-3 text-base">
            {fly.note}
          </p>
        ) : null}
        <div className="mt-1 flex flex-wrap gap-2">
          <button type="button" onClick={onNext} className={buttonStyle("primary", "md", "inline-flex")}>
            {t`次へ`}
          </button>
          <Link href={stop.href} className={buttonStyle("secondary", "md", "inline-flex")}>
            {t`詳細を見る`}
          </Link>
        </div>
      </div>
    </div>
  );
}
