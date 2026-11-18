"use client";

import dynamic from "next/dynamic";
import { Trans } from "@lingui/react/macro";

// The map needs the browser (WebGL), so it is loaded there only, like the course editor's map.
export const OneMapLoader = dynamic(() => import("./OneMap").then((m) => m.OneMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[34rem] items-center justify-center rounded-2xl bg-surface text-lg">
      <Trans>地図を読み込み中…</Trans>
    </div>
  ),
});
