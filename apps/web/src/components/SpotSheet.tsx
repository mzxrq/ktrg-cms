import type { ComponentProps } from "react";
import Link from "next/link";
import { Trans } from "@lingui/react/macro";
import { pickText, type SpotDetail } from "@/lib/content";
import { CoverPhoto } from "./CoverPhoto";
import { SpotStats, type StopPlace } from "./SpotStats";
import { Localized } from "./Localized";
import { NameRuby } from "./Ruby";
import { NearbyPlaces, type Nearby } from "./NearbyPlaces";
import { LastUpdated } from "@/components/LastUpdated";
import { NearestPlaces, type NearestGroup } from "./NearestPlaces";
import { Notice } from "./Notice";
import { RichText } from "./RichText";
import { SpotGallery } from "./SpotGallery";
import { StampFace } from "./StampFace";
import { StampHere } from "./StampHere";
import { StatusBanner } from "./StatusBanner";
import type { StampMock } from "@/lib/stamp-flow";
import { buttonStyle } from "@/components/button";

/**
 * The spot detail sheet (WBS 3.2.5). Presentational on purpose: today it is the
 * body of /spots/[id]; the map's bottom sheet (3.2.10) will render the same thing.
 * The big stamp button at the bottom stays in view while the page scrolls (`StampHere`, WBS 3.3.1): it reads the
 * phone's position once and asks the server, which decides. A signed-out visitor gets a real link to log in.
 */
export function SpotSheet({
  spot,
  locale,
  loginHref,
  stampMock,
  stampProgress,
  nearby = [],
  nearest = [],
  place,
}: {
  spot: SpotDetail;
  locale: string;
  loginHref: string;
  /** What is around the place (toilets, shops ...), nearest first. */
  nearby?: Nearby[];
  /** The nearest stations, bus stops and parking, a tab for each. */
  nearest?: NearestGroup[];
  /** Its number on the course and the walk from the stop before, when the course is known. */
  place?: StopPlace;
  /** Development only: pretend answers for the stamp button. */
  stampMock?: StampMock;
  /** Where the spot's course stood before this stamp, for the "stamp collected" popup. */
  stampProgress?: ComponentProps<typeof StampHere>["progress"];
}) {
  // A place without a stamp has a page to read, but no stamp card and no stamp button.
  const stampable = spot.stampable !== false;
  const description = pickText(locale, spot.descriptionJa, spot.descriptionEn);
  const history = pickText(locale, spot.historyJa ?? null, spot.historyEn ?? null);
  const source = pickText(locale, spot.sourceJa ?? null, spot.sourceEn ?? null);
  const gallery = spot.gallery ?? [];
  // The main photo's name (what it shows) leads its credit in the cover's © tag, and describes it for screen readers.
  const photoName = pickText(locale, spot.photoNameJa ?? null, spot.photoNameEn ?? null)?.text;
  const photo = spot.photoUrl
    ? { src: spot.photoUrl, alt: photoName ?? pickText(locale, spot.nameJa, spot.nameEn)?.text ?? spot.nameJa, caption: photoName, credit: spot.photoCredit }
    : null;

  return (
    <article className="flex flex-col gap-6">
      {photo ? <CoverPhoto photo={photo} /> : null}
      <header className={`relative px-4 ${photo ? "-mt-20" : ""}`}>
        <h1 className="font-serif text-4xl font-bold leading-tight text-accent has-[rt]:pt-4">
          <NameRuby title={pickText(locale, spot.nameJa, spot.nameEn)} reading={spot.nameKana} />
        </h1>
        <p className="mt-2 text-lg text-muted">
          <Localized value={pickText(locale, spot.routeNameJa, spot.routeNameEn)} />
        </p>
        <div className="mt-5">
          <SpotStats spot={spot} place={place} />
        </div>
        {/* Only a place with a (checked) position can be shown on the map; the map opens on this course and this stop. */}
        {spot.position ? (
          <Link href={`/map?route=${encodeURIComponent(spot.routeId)}&stop=${encodeURIComponent(spot.id)}`} className={buttonStyle("secondary", "md", "mt-5 inline-flex")}>
            <Trans>地図で見る</Trans>
          </Link>
        ) : null}
      </header>

      {/* The grid already says the status; the block is for what needs more: caution, closed, or a note. */}
      {spot.status !== "open" || spot.statusNoteJa || spot.statusNoteEn ? (
        <StatusBanner status={spot.status} noteJa={spot.statusNoteJa} noteEn={spot.statusNoteEn} updatedAt={spot.statusUpdatedAt} locale={locale} />
      ) : null}

      {stampable ? (
      <section className="mx-4 flex items-center gap-4 rounded-lg bg-surface p-4">
        {/* Once stamped, the card says so with the stamp itself, in place of how to stamp (2026-11-18, user). */}
        <StampFace state={spot.stamped === true ? "stamped" : "empty"} image={spot.stampImageUrl} className="h-14 w-14 shrink-0 rounded-full!" />
        {spot.stamped === true ? (
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
      ) : null}

      {description ? (
        <section className="px-4">
          <h2 className="border-l-4 border-brand pl-3 font-serif text-xl font-bold text-accent">
            <Trans>説明</Trans>
          </h2>
          {/* Editors type plain text; line breaks are kept. Never raw HTML. */}
          <div className="mt-2 max-w-prose whitespace-pre-line text-lg leading-8">
            <RichText text={description.text} lang={description.lang} />
          </div>
          {description.fallback ? (
            <p className="mt-2 text-base text-muted">
              <Trans>この説明は日本語のみです。</Trans>
            </p>
          ) : null}
        </section>
      ) : null}

      {history ? (
        <section className="px-4">
          <h2 className="border-l-4 border-brand pl-3 font-serif text-xl font-bold text-accent">
            <Trans>歴史・由来</Trans>
          </h2>
          <div className="mt-2 max-w-prose whitespace-pre-line text-lg leading-8">
            <RichText text={history.text} lang={history.lang} />
          </div>
          {history.fallback ? (
            <p className="mt-2 text-base text-muted">
              <Trans>この説明は日本語のみです。</Trans>
            </p>
          ) : null}
        </section>
      ) : null}

      {source ? (
        <section className="px-4">
          <h2 className="border-l-4 border-brand pl-3 font-serif text-xl font-bold text-accent">
            <Trans>出典</Trans>
          </h2>
          <div className="mt-2 max-w-prose whitespace-pre-line text-base leading-7 text-muted">
            <RichText text={source.text} lang={source.lang} />
          </div>
        </section>
      ) : null}

      {gallery.length > 0 ? (
        <section className="px-4">
          <h2 className="mb-2 border-l-4 border-brand pl-3 font-serif text-xl font-bold text-accent">
            <Trans>写真</Trans>
          </h2>
          <SpotGallery photos={gallery} alt={pickText(locale, spot.nameJa, spot.nameEn)?.text ?? spot.nameJa} locale={locale} />
        </section>
      ) : null}

      {nearby.length > 0 ? (
        // The title stands over open space, the list sits in the capsule (design language: no title inside a card).
        <section className="px-4">
          <h2 className="mb-2 border-l-4 border-brand pl-3 font-serif text-xl font-bold text-accent">
            <Trans>周辺の施設</Trans>
          </h2>
          <div className="rounded-lg bg-surface px-5 py-2">
            <NearbyPlaces places={nearby} />
          </div>
        </section>
      ) : null}

      {nearest.length > 0 ? (
        <section className="px-4">
          <h2 className="mb-2 border-l-4 border-brand pl-3 font-serif text-xl font-bold text-accent">
            <Trans>最寄りアクセス</Trans>
          </h2>
          <div className="rounded-lg bg-surface p-5">
            <NearestPlaces groups={nearest} />
          </div>
        </section>
      ) : null}
      
      <LastUpdated iso={spot.updatedAt} locale={locale} className="px-4" />

      {stampable ? (
        <StampHere spotId={spot.id} status={spot.status} alreadyStamped={spot.stamped === true} stampImage={spot.stampImageUrl} loginHref={loginHref} mock={stampMock} progress={stampProgress} />
      ) : null}
    </article>
  );
}
