"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { AccessIcon, useAccessTypeNames } from "@/components/AccessList";
import { Localized } from "@/components/Localized";
import { pickText } from "@/lib/pick-text";
import { courseEnds, nearerEnd, sortAccess, transitLink } from "@/lib/navigation/transit-links";
import { useNavigation } from "./NavigationProvider";
import { buttonStyle } from "@/components/button";
import { CloseIcon } from "@/components/icons";

const linkClass = buttonStyle("secondary", "sm", "inline-flex");

/**
 * Shown instead of the distance and direction when the visitor is far from the course (docs/navigation-transit-plan.md):
 * the course's hand-entered ways of getting there, with links to other services for the real timetables, and the walking
 * route as a choice. Nothing is routed here, and only a station's checked position is put in a link.
 */
export function NavFarCard() {
  const { t, i18n } = useLingui();
  const { session, chooseWalk, signedIn } = useNavigation();
  const names = useAccessTypeNames();
  const dialog = useRef<HTMLDialogElement>(null);
  const [asked, setAsked] = useState(false); // shortcut: stays "asking" until the path arrives or the card goes away; add a retry if that is not enough
  // A guest's first tap on the walking route: signing up is offered here, and skipping it walks on (2026-11-16, user).
  const [offer, setOffer] = useState(false);
  const walk = () => {
    setAsked(true);
    setOffer(false);
    chooseWalk();
  };
  if (!session) return null;
  const { model, snapshot, access } = session;
  const points = sortAccess(access, nearerEnd(courseEnds(model), snapshot.position ?? { lat: 0, lng: 0 }));
  const external = t`（外部サイトを新しいタブで開きます）`;

  // The banner stays small so the map is still seen; the ways to get there open in a dialog.
  return (
    <div className="flex flex-col gap-2">
      <p className="text-lg font-bold leading-snug">{t`このコースは現在地から離れています。電車やバスなどで向かってください。`}</p>
      <button type="button" onClick={() => dialog.current?.showModal()} className={buttonStyle("primary", "md", "flex w-full")}>
        {t`アクセスを見る`}
      </button>
      {/* Rule 1 (docs/navigation-v2-plan.md): the title and the buttons stay put; only the ways to get there scroll. */}
      <dialog ref={dialog} aria-labelledby="nav-far-title" className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm flex-col overflow-hidden rounded-lg bg-paper text-ink backdrop:bg-black/60 open:flex">
        <div className="flex shrink-0 items-center justify-between gap-2 px-5 pt-5">
          <h2 id="nav-far-title" className="text-2xl font-bold">
            {t`アクセス`}
          </h2>
          <button type="button" onClick={() => dialog.current?.close()} aria-label={t`閉じる`} className="tap-target -mr-2 inline-flex shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface">
            <CloseIcon />
          </button>
        </div>
        <div className="mt-3 flex min-h-0 flex-col gap-4 overflow-y-auto px-5 pb-1">
          {points.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-lg font-bold">{t`電車・バスなどで向かう`}</h3>
              <ul className="flex flex-col gap-2">
                {points.map((p, i) => {
                  const name = pickText(i18n.locale, p.nameJa, p.nameEn);
                  const note = pickText(i18n.locale, p.noteJa, p.noteEn);
                  const links = [
                    { label: t`Googleマップ`, href: transitLink(p, "google") },
                    { label: t`Yahoo!マップ`, href: transitLink(p, "yahoo") },
                    { label: t`時刻表`, href: p.url && /^https:\/\//.test(p.url) ? p.url : null },
                  ].filter((l): l is { label: string; href: string } => l.href !== null);
                  return (
                    <li key={i} className="flex flex-col gap-2 rounded-lg bg-surface p-3">
                      <div className="flex items-center gap-3">
                        <AccessIcon type={p.type} size={44} />
                        <div className="min-w-0">
                          <p className="text-base leading-tight text-muted">{names[p.type]}</p>
                          <p className="text-lg font-bold leading-snug">
                            <Localized value={name} />
                          </p>
                        </div>
                      </div>
                      {note ? (
                        <p className="text-base leading-snug">
                          <Localized value={note} tag={false} />
                        </p>
                      ) : null}
                      {links.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {links.map((l) => (
                            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className={linkClass}>
                              {l.label}
                              <span aria-hidden="true"> ↗</span>
                              <span className="sr-only"> {external}</span>
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <p className="text-base leading-snug text-muted">{t`外部サービスが開きます。共有されるのは目的地の位置のみで、現在地は送信されません。`}</p>
            </section>
          ) : (
            <p className="text-base leading-snug text-muted">{t`このコースのアクセス情報はまだ登録されていません。`}</p>
          )}
        </div>
        <div data-nav-footer className="flex shrink-0 flex-col gap-2 border-t border-line px-5 pb-5 pt-4">
          {offer ? (
            <section aria-labelledby="nav-far-signup" className="flex flex-col gap-2 rounded-lg bg-surface p-3">
              <h3 id="nav-far-signup" className="text-lg font-bold">
                {t`アカウントを登録しませんか？`}
              </h3>
              <p className="text-base leading-snug">{t`登録すると、スタンプや歩行記録をアカウントに保存でき、他の端末からも確認できます。登録せずにこのままルートを見ることもできます。`}</p>
              <Link href="/register" className={buttonStyle("primary", "md", "flex w-full")}>
                {t`新規登録`}
              </Link>
              <button type="button" onClick={walk} className={buttonStyle("secondary", "md", "flex w-full")}>
                {t`登録せずに徒歩ルートを見る`}
              </button>
            </section>
          ) : (
            <button type="button" disabled={asked} onClick={() => (signedIn ? walk() : setOffer(true))} className={buttonStyle("secondary", "md", "flex w-full")}>
              {asked ? t`徒歩ルートを検索中…` : t`徒歩ルートを見る`}
            </button>
          )}
          <button type="button" onClick={() => dialog.current?.close()} className={buttonStyle("secondary", "md", "flex w-full")}>
            {t`閉じる`}
          </button>
        </div>
      </dialog>
    </div>
  );
}
