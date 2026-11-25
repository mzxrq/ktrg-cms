"use client";

import { useEffect, useState, JSX, SVGProps } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { isInAppBrowser } from "@/lib/browser-check";

const big =
  "tap-target flex min-h-12 w-full items-center justify-center rounded-full px-6 text-xl font-bold";

const ShareIcon: React.FC<React.SVGProps<SVGSVGElement>> = (
  props: JSX.IntrinsicAttributes & SVGProps<SVGSVGElement>,
) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    {...props}
  >
    <path d="M12 2v13" />
    <path d="m16 6-4-4-4 4" />
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
  </svg>
);

type InstallPrompt = Event & { prompt: () => Promise<unknown> };

/**
 * How to put the app on the home screen (see MDN, "Making PWAs installable"). Where the browser offers an install prompt
 * (Chrome and Edge, Android and desktop) a button asks for it; on an iPhone or iPad the way is Safari's share menu, which no
 * page can open, so the steps are written out; a browser inside another app (LINE ...) cannot add it at all. Only drawn
 * after the person has asked for it (InstallNudge), so it never runs on the server.
 */
/** A screenshot of one step on an iPhone (public/install; they carry the "tap here" marks in Japanese). */
function StepPicture({
  name,
  height,
  alt,
}: {
  name: string;
  height: number;
  alt: string;
}) {
  // eslint-disable-next-line @next/next/no-img-element -- a small static file, already sized
  return (
    <img
      src={`/install/ios-${name}.webp`}
      alt={alt}
      width={720}
      height={height}
      loading="lazy"
      decoding="async"
      className="mt-3 h-auto w-full max-w-sm rounded-lg border border-line"
    />
  );
}

export function InstallSteps({ titleId }: { titleId: string }) {
  const { t } = useLingui();
  const [offer, setOffer] = useState<InstallPrompt | null>(null);
  const [ua] = useState(() => navigator.userAgent);
  const ios =
    /\b(iPhone|iPad|iPod)\b/.test(ua) ||
    (/\bMacintosh\b/.test(ua) && navigator.maxTouchPoints > 1);
  useEffect(() => {
    const onOffer = (e: Event) => {
      e.preventDefault(); // keep the browser's own mini bar away: the button below asks instead
      setOffer(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onOffer);
    return () => window.removeEventListener("beforeinstallprompt", onOffer);
  }, []);
  return (
    <>
      <h2 id={titleId} className="font-serif text-3xl font-bold text-accent">
        <Trans>ホーム画面に追加</Trans>
      </h2>
      <p className="text-lg leading-8">
        <Trans>
          ホーム画面に追加すると、アプリのようにすぐ開けます。散策中もすぐに見返せて便利です。
        </Trans>
      </p>
      {isInAppBrowser(ua) ? (
        <p className="rounded-lg bg-surface p-4 text-lg leading-8">
          <Trans>
            アプリ内ブラウザで開いています。SafariやChromeで開き直してから追加してください。
          </Trans>
        </p>
      ) : offer ? (
        <button
          type="button"
          onClick={() => void offer.prompt()}
          className={`${big} bg-ink text-paper`}
        >
          <Trans>ホーム画面に追加</Trans>
        </button>
      ) : ios ? (
        <ol className="flex list-decimal flex-col gap-6 rounded-lg bg-surface p-4 pl-9 text-lg leading-8">
          <li>
            <Trans>
              Safariの画面下部（または上部）にある共有ボタン（
              <ShareIcon />
              ）をタップします。
            </Trans>
            <StepPicture
              name="share"
              height={560}
              alt={t`Safariの画面下部（または上部）にある共有ボタンをタップします。`}
            />
          </li>
          <li>
            <Trans>
              メニューを下にスクロールして、「ホーム画面に追加」をタップします。
            </Trans>
            <StepPicture
              name="menu"
              height={762}
              alt={t`メニューを下にスクロールして、「ホーム画面に追加」をタップします。`}
            />
          </li>
          <li>
            <Trans>右上の「追加」をタップします。</Trans>
            <StepPicture
              name="add"
              height={593}
              alt={t`右上の「追加」をタップします。`}
            />
          </li>
          <li>
            <Trans>
              ホーム画面に葛城修験のアイコンが追加されたら完了です。
            </Trans>
            <StepPicture
              name="done"
              height={778}
              alt={t`ホーム画面に葛城修験のアイコンが追加されたら完了です。`}
            />
          </li>
        </ol>
      ) : (
        <p className="rounded-lg bg-surface p-4 text-lg leading-8">
          <Trans>
            ブラウザのメニュー（⋮ や
            ⋯）から、「ホーム画面に追加」または「アプリをインストール」を選択します。
          </Trans>
        </p>
      )}
    </>
  );
}
