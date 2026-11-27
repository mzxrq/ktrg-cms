import type { ComponentProps } from "react";
import { SpotText } from "./SpotText";
import { StampCard } from "./StopParts";
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
import { SpotGallery } from "./SpotGallery";
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
  // As the server (stamp-store): a 遥拝 place always, any other place only while closed (閉鎖時のスタンプ地点).
  const usesStampFrom = !!spot.stampFrom?.status && spot.status !== "info" && (spot.detached === true || spot.status === "closed");
  const stampStatus = usesStampFrom ? spot.stampFrom!.status! : spot.status;
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
        <StatusBanner status={spot.status} noteJa={spot.statusNoteJa} noteEn={spot.statusNoteEn} updatedAt={spot.statusUpdatedAt} locale={locale} stampOpen={stampStatus !== "closed"} />
      ) : null}

      {stampable ? (
      <StampCard className="mx-4" stamped={spot.stamped === true} image={spot.stampImageUrl} />
      ) : null}
      {/* A waypoint other places are stamped at (遥拝, or a closed place's 閉鎖時のスタンプ地点): one press gives those too. */}
      {stampable && spot.stampedHere?.length ? (
        <p className="mx-4 -mt-4 text-lg">
          <Trans>他の獲得できるスタンプ：{spot.stampedHere.map((p) => (locale === "ja" ? p.nameJa : (p.nameEn ?? p.nameJa))).join(locale === "ja" ? "、" : ", ")}</Trans>
        </p>
      ) : null}

      <SpotText description={description} history={history} source={source} />

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
        <StampHere spotId={spot.id} status={stampStatus} alreadyStamped={spot.stamped === true} stampImage={spot.stampImageUrl} loginHref={loginHref} mock={stampMock} progress={stampProgress} />
      ) : null}
    </article>
  );
}
