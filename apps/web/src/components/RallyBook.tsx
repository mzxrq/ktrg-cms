"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLingui } from "@lingui/react/macro";
import { buttonStyle } from "@/components/button";
import { useDistanceText } from "@/components/map/PlacesPanel";
import { formatUpdated } from "@/lib/format";
import { pickText } from "@/lib/pick-text";
import { WIDE_QUERY, watchQuery } from "@/lib/screen";
import { NameRuby } from "./Ruby";
import { BOOK_SIDE_ID, type BookPage } from "@/lib/rally-book";
import { moveTo, turnIn, walkSeconds } from "@/lib/rally-motion";
import { isDone } from "@/lib/rally-trail";
import { ChevronIcon } from "./icons";
import { RoutePhoto } from "./RoutePhoto";
import { RichText } from "./RichText";
import { SpotText } from "./SpotText";
import { StatusBanner } from "./StatusBanner";
import { Walker } from "./Walker";

const subscribeWide = (onChange: () => void) => watchQuery(WIDE_QUERY, onChange);
const isWide = () => window.matchMedia(WIDE_QUERY).matches;


/**
 * The trail (its children) with a book page for each place. On a wide screen the page opens in the right column under the
 * stamps instead of over the trail (2026-11-16, user: the page has two columns, so no pop-up there). Pressing a place's card opens its page over the trail; the
 * arrows turn to the next and previous place; closing returns to the trail. Without scripts a card is still a link to the
 * place's own page, where the stamp is pressed. The rising and fading comes from the shared dialog motion.
 */
export function RallyBook({ pages, children }: { pages: readonly BookPage[]; children: ReactNode }) {
  const { t, i18n } = useLingui();
  const locale = i18n.locale;
  const distance = useDistanceText();
  const ref = useRef<HTMLDialogElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const article = useRef<HTMLElement>(null);
  const was = useRef<number | null>(null);
  const dir = useRef<1 | -1>(1);
  const [index, setIndex] = useState<number | null>(null);
  const page = index === null ? null : (pages[index] ?? null);
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (page && !wide && !d.open) d.showModal();
    if ((!page || wide) && d.open) d.close();
  }, [page, wide]);

  // In the column the page opens beside the trail: bring it into view and move the focus to its name.
  useEffect(() => {
    if (!wide || index === null) return;
    heading.current?.focus({ preventScroll: true });
    document.getElementById(BOOK_SIDE_ID)?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [wide, index]);

  // A turn of the page, and the trail's walker following the page that is open (home again when the book closes).
  useLayoutEffect(() => {
    const before = was.current;
    was.current = index;
    if (index !== null && before !== null && before !== index) {
      ref.current?.scrollTo(0, 0);
      document.getElementById(BOOK_SIDE_ID)?.scrollTo(0, 0);
      if (article.current) turnIn(article.current, dir.current);
    }
    const walker = root.current?.querySelector<SVGElement>("[data-trail-walker]");
    const home = walker?.closest("li")?.querySelector("[data-marker]");
    const id = index === null ? null : pages[index]?.id;
    const target = id ? root.current?.querySelector(`a[data-stop="${CSS.escape(id)}"]`)?.closest("li")?.querySelector("[data-marker]") : home;
    if (walker && home && target) {
      const dy = target.getBoundingClientRect().top - home.getBoundingClientRect().top;
      moveTo(walker, { y: dy }, walkSeconds(dy));
    }
  }, [index, pages]);

  const open = (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // a new tab keeps the link
    const link = (e.target as Element).closest<HTMLAnchorElement>("a[data-stop]");
    if (!link) return;
    const at = pages.findIndex((p) => p.id === link.dataset.stop);
    if (at < 0) return;
    e.preventDefault();
    e.stopPropagation(); // the card is a next/link: it must not navigate as well
    setIndex(at);
  };
  const turn = (by: number) => {
    dir.current = by > 0 ? 1 : -1;
    setIndex((i) => (i === null ? i : Math.min(pages.length - 1, Math.max(0, i + by))));
  };

  const pick = (ja: string | null, en: string | null) => (ja === null ? null : pickText(locale, ja, en));
  const name = page ? (pick(page.nameJa, page.nameEn) ?? { text: page.nameJa, lang: "ja" as const, fallback: false }) : null;
  const line = page ? pick(page.descriptionJa, page.descriptionEn) : null;
  const history = page ? pick(page.historyJa, page.historyEn) : null;
  const note = page ? pick(page.statusNoteJa, page.statusNoteEn) : null;
  const access = page ? pick(page.accessJa, page.accessEn) : null;
  const nextName = page?.next ? (pick(page.next.nameJa, page.next.nameEn)?.text ?? page.next.nameJa) : null;
  const toiletName = page?.toilet ? (pick(page.toilet.nameJa, page.toilet.nameEn)?.text ?? page.toilet.nameJa) : null;
  const toiletHours = page?.toilet ? pick(page.toilet.hoursJa, page.toilet.hoursEn)?.text : null;
  const label = "text-base font-bold text-accent";
  const arrow = "tap-target inline-flex size-12 items-center justify-center rounded-full border-2 border-ink bg-paper disabled:opacity-40";
  const when = page?.stampedAt ? formatUpdated(locale, page.stampedAt) : "";
  const counted = pages.filter((p) => p.number !== null).length;

  const content =
    page && name ? (
          <article ref={article} className="flex flex-col">
            <div className="relative aspect-[16/10]">
              <RoutePhoto src={page.photoUrl} alt={name.text} />
            </div>
            <div className="flex flex-col gap-4 p-5">
              <header className="flex flex-col gap-1">
                {page.number !== null ? <p className="text-base text-muted">{`${page.number} / ${counted}`}</p> : null}
                {/* The reading over the kanji, as on the course page (NameRuby: Japanese only, a reading a person typed). */}
                <h2 ref={heading} tabIndex={-1} lang={name.lang} className="font-serif text-2xl font-bold leading-[2] text-accent focus:outline-none">
                  <NameRuby title={name} reading={page.nameKana} />
                </h2>
              </header>

              <p className="text-lg font-bold">
                {page.state === "stamped" && page.stampedAt ? (
                  <span className="text-moss">{t`押した日時　${when}`}</span>
                ) : page.state === "stamped" ? (
                  <span className="text-moss">{t`押した`}</span>
                ) : page.state === "next" ? (
                  // The place to stamp next stands out (2026-11-16, user: a plain つぎ was easy to miss). White on brand red is for large bold words only.
                  <span className="inline-flex items-center rounded-full bg-brand px-4 py-1 text-xl font-bold text-paper">{t`つぎに押す場所`}</span>
                ) : page.state === "todo" ? (
                  <span className="text-muted">{t`まだ`}</span>
                ) : null}
              </p>

              {/* The same status block and words as the place's own page (StatusBanner, SpotText): links and notes included. */}
              {page.status !== "open" || note ? (
                <div className="-mx-5 px-1">
                  <StatusBanner status={page.status} noteJa={page.statusNoteJa} noteEn={page.statusNoteEn} updatedAt={null} locale={locale} />
                </div>
              ) : null}
              <SpotText description={line} history={history} className="" level={3} />

              {page.next && nextName ? (
                <p className="text-base">
                  <span className="text-muted">{t`つぎの場所まで`}　</span>
                  <span className="font-bold">
                    {nextName}　{distance(page.next.meters)}
                  </span>
                </p>
              ) : null}

              {page.next ? <BookStrip key={page.id} state={page.state} /> : null}

              {access ? (
                <section className="flex flex-col gap-1">
                  <h3 className={label}>{t`行き方`}</h3>
                  <div lang={access.lang} className="whitespace-pre-line text-base leading-relaxed">
                    <RichText text={access.text} lang={access.lang} />
                  </div>
                </section>
              ) : null}

              {page.toilet && toiletName ? (
                <section className="flex flex-col gap-1">
                  <h3 className={label}>{t`近くのトイレ`}</h3>
                  <p className="text-base">
                    <span className="font-bold">{toiletName}</span>　{distance(page.toilet.meters)}
                    {toiletHours ? <span className="text-muted">　{toiletHours}</span> : null}
                  </p>
                </section>
              ) : null}

              <Link href={`/spots/${page.id}`} className={buttonStyle("primary", "lg", "flex w-full")}>
                {t`この場所のページを開く`}
              </Link>

              {/* Pinned to the bottom edge, so a long page can still be turned without scrolling back down. */}
              <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center justify-between gap-3 border-t border-line/40 bg-paper px-5 py-3">
                <button type="button" aria-label={t`前の場所`} disabled={index === 0} onClick={() => turn(-1)} className={arrow}>
                  <span className="rotate-180">
                    <ChevronIcon />
                  </span>
                </button>
                <button type="button" onClick={() => setIndex(null)} className={buttonStyle("secondary", "md", "inline-flex")}>
                  {t`閉じる`}
                </button>
                <button type="button" aria-label={t`次の場所`} disabled={index === pages.length - 1} onClick={() => turn(1)} className={arrow}>
                  <ChevronIcon />
                </button>
              </div>
            </div>
          </article>
    ) : null;
  const side = wide && typeof document !== "undefined" ? document.getElementById(BOOK_SIDE_ID) : null;

  return (
    <>
      {side && content ? createPortal(<section aria-label={name?.text} className="overflow-hidden rounded-lg border-2 border-ink bg-paper">{content}</section>, side) : null}
      <div ref={root} onClickCapture={open}>
        {children}
      </div>
      <dialog
        ref={ref}
        aria-label={name?.text}
        onClose={() => setIndex(null)}
        onClick={(e) => e.target === ref.current && setIndex(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") turn(-1);
          if (e.key === "ArrowRight") turn(1);
        }}
        className="m-auto max-h-[92dvh] w-[min(34rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border-2 border-ink bg-paper p-0 text-ink backdrop:bg-black/60"
      >
        {wide ? null : content}
      </dialog>
    </>
  );
}

/**
 * A small path inside the page, from this place to the next. On a place already stamped the walker has gone on toward the
 * next one (it walks across at Full, stands at the far end otherwise); on the next place it stands here; a place still to
 * do has the path only.
 */
function BookStrip({ state }: { state: BookPage["state"] }) {
  const box = useRef<HTMLDivElement>(null);
  const walker = useRef<SVGSVGElement>(null);
  useLayoutEffect(() => {
    const b = box.current;
    const w = walker.current;
    if (!b || !w) return;
    const travel = Math.max(0, b.clientWidth - w.clientWidth - 24);
    moveTo(w, { x: isDone(state) ? travel : 0 }, walkSeconds(travel) + 0.3, { x: 0 });
  }, [state]);
  const walking = isDone(state) || state === "next";
  return (
    <div ref={box} aria-hidden="true" className="relative h-10">
      <span className="absolute inset-x-2 top-[34px] border-t-[3px] border-dotted border-line" />
      <span className="absolute left-1 top-[28px] size-3.5 rounded-full bg-shu" />
      <span className="absolute right-1 top-[27px] size-4 rounded-full border-2 border-dashed border-line" />
      {walking ? <Walker ref={walker} className="absolute left-3 top-0 h-9 text-moss" /> : null}
    </div>
  );
}
