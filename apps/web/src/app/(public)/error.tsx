"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useLingui } from "@lingui/react/macro";
import { buttonStyle } from "@/components/button";

// Shown by Next.js when a page breaks while it is being drawn (WBS 3.5.5). The visitor gets a plain sentence, a
// way to try again and a way home; the technical details never reach the screen. The header and the tab bar
// stay, because only this part of the page failed.
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLingui();

  useEffect(() => {
    // The digest identifies the failure in the server log; nothing else about it is sent anywhere from here.
    console.error("page error", error.digest ?? "");
  }, [error]);

  return (
    <div role="alert" className="state-stagger flex flex-col gap-6 px-4 pt-2">
      <h1 className="font-serif text-3xl font-bold text-accent">{t`ページを表示できませんでした`}</h1>
      <p className="text-xl leading-8">{t`申し訳ありません。ただいまページを読み込めない状態です。再読み込みしても解決しない場合は、しばらく時間をおいてから再度お試しください。`}</p>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className={buttonStyle("primary", "lg", "flex w-full")}
        >
          {t`再読み込み`}
        </button>
        <Link
          href="/"
          className={buttonStyle("secondary", "lg", "flex w-full")}
        >
          {t`ホームに戻る`}
        </Link>
      </div>
    </div>
  );
}
