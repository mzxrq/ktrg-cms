import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { BackLink } from "@/components/BackLink";
import { CertificateButton } from "@/components/CertificateButton";
import { CoverPhoto } from "@/components/CoverPhoto";
import { LastUpdated } from "@/components/LastUpdated";
import { SaveBookmark } from "@/components/SaveBookmark";
import { RallyNearbyStamp } from "@/components/RallyNearbyStamp";
import { Bar } from "@/components/RallyViews";
import { RallyBook } from "@/components/RallyBook";
import { BOOK_SIDE_ID } from "@/lib/rally-book";
import { RallyTrail } from "@/components/RallyTrail";
import { Medal } from "@/components/Medal";
import { StampGrid } from "@/components/StampGrid";
import { StampLegend } from "@/components/StampLegend";
import { fetchPublicPlaces, fetchPublicRally } from "@/lib/api-content";
import { listRallies, listRoutes, pickText } from "@/lib/content";
import { journeyFacts } from "@/lib/rally-journey";
import { bookPages } from "@/lib/rally-book";
import { JourneyFacts } from "@/components/JourneyFacts";
import { getMyStamps } from "@/lib/my-stamps";
import { isSoon, nextSlot, stampedNumbers } from "@/lib/rally-model";
import { getViewer } from "@/lib/viewer";
import { initLingui } from "@/i18n/server";
import { buttonStyle } from "@/components/button";
import { offersNoStamp } from "@/lib/spot-status";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ as?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const i18n = await initLingui();
  const rally = await fetchPublicRally((await params).id);
  return { title: rally ? pickText(i18n.locale, rally.nameJa, rally.nameEn)?.text : undefined };
}

// One rally on its own page: its photo, how far along the visitor is, the stamps still to unlock, the places in order,
// and the three things to do (bookmark it, head for the next place on the map, stamp the place they are standing at).
export default async function RallyPage({ params, searchParams }: Props) {
  const i18n = await initLingui();
  const { id } = await params;
  const [viewer, detail, rallies, mine, routes, directory] = await Promise.all([getViewer(searchParams), fetchPublicRally(id), listRallies(), getMyStamps(), listRoutes(), fetchPublicPlaces()]);
  const rally = rallies.find((r) => r.id === id);
  if (!detail || !rally) notFound();

  const name = pickText(i18n.locale, rally.nameJa, rally.nameEn)?.text ?? rally.nameJa;
  const stamped = rally.stamped ?? 0;
  const done = rally.total > 0 && stamped === rally.total;
  const held = [...mine.ids];
  const finishedAt = mine.completed.get(id) ?? null;
  const heldSet = new Set(held);
  // Each place's book page: its own text, the course's access text and the nearest toilet of the directory (checked positions only).
  const pages = bookPages({
    places: detail.places.map((p) => ({
      id: p.id,
      routeId: p.routeId,
      status: p.status,
      nameJa: p.nameJa,
      nameEn: p.nameEn,
      nameKana: p.nameKana ?? null,
      photoUrl: p.photoUrl ?? null,
      descriptionJa: p.descriptionJa ?? null,
      descriptionEn: p.descriptionEn ?? null,
      historyJa: p.historyJa ?? null,
      historyEn: p.historyEn ?? null,
      statusNoteJa: p.statusNoteJa ?? null,
      statusNoteEn: p.statusNoteEn ?? null,
      lat: p.lat,
      lng: p.lng,
    })),
    held: heldSet,
    stampedAt: mine.at,
    routes: detail.routes ?? [],
    toilets: (directory ?? []).filter((d) => d.category === "toilet"),
  });
  // Where "start now" leads: the next place not yet stamped (the first one when nothing is), opened on the map.
  const next = nextSlot(rally);
  const start = detail.places.find((p) => p.id === next?.id) ?? detail.places.find((p) => !heldSet.has(p.id));
  const startHref = start ? `/map?route=${encodeURIComponent(start.routeId)}&stop=${encodeURIComponent(start.id)}` : "/map";
  const canStampHere = !done && detail.places.some((p) => p.lat !== null && !offersNoStamp(p.status) && !heldSet.has(p.id));
  const button = buttonStyle("primary", "lg", "flex w-full");
  const quietButton = buttonStyle("secondary", "lg", "flex w-full");
  const photo = detail.photoUrl ? { src: detail.photoUrl, alt: name, credit: detail.photoCredit ?? null } : null;
  // One main button at a time: the way to the first place until something is stamped, then the stamp button for the place you are at.

  return (
    // A phone: one column in this order (back, photo, name, progress, buttons, stamps, places). From a wide screen: the words on the
    // left and the stamp faces in a column of their own on the right (as the course page keeps its map), which stays in view.
    <div className="flex flex-col gap-6 pt-2 wide:grid wide:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] wide:items-start wide:gap-x-8 wide:pt-0">
      <div className="contents wide:flex wide:min-w-0 wide:flex-col wide:gap-6">
      <div className="order-1 px-4 wide:order-none">
        <BackLink href="/rallies">
          <Trans>ラリー</Trans>
        </BackLink>
      </div>

      {/* The course page's cover: the photo runs to the edge and fades into the page, and the name sits on the fade. */}
      {photo ? (
        <div className="order-2 wide:order-none">
          <CoverPhoto photo={photo} flat />
        </div>
      ) : null}
      <header className={`relative order-3 flex flex-col gap-4 px-4 wide:order-none ${photo ? "-mt-20" : ""}`}>
        <h1 className="font-serif text-3xl font-bold leading-snug text-accent wide:text-4xl">{name}</h1>
        {isSoon(rally) ? (
          <p className="inline-block w-fit rounded-lg border-2 border-dashed border-line px-3 text-xl font-bold text-muted">
            <Trans>準備中</Trans>
          </p>
        ) : null}
      </header>

      {done ? (
        // A finished rally: the closed medal, in place of the count and the bar.
        <section className="pattern-shippo order-4 mx-4 flex flex-col items-center gap-3 rounded-[1.75rem] bg-surface p-6 text-center wide:order-none">
          <Medal number={rally.total} done stamped={rally.total} total={rally.total} className="h-44 w-auto" />
          <p className="font-serif text-3xl font-bold text-accent">
            <Trans>コンプリート！</Trans>
          </p>
          <p className="text-xl font-bold">
            <Trans>{rally.total}か所、すべてそろいました。</Trans>
          </p>
          {finishedAt ? (
            <p className="text-lg text-muted">
              <Trans>達成日</Trans> <time dateTime={finishedAt}>{new Intl.DateTimeFormat(i18n.locale === "ja" ? "ja-JP" : "en-US", { dateStyle: "long", timeZone: "Asia/Tokyo" }).format(new Date(finishedAt))}</time>
            </p>
          ) : null}
          {viewer.signedIn ? <CertificateButton title={name} total={rally.total} locale={i18n.locale} /> : null}
        </section>
      ) : stamped === 0 && rally.total > 0 ? (
        // Not started: how big the walk is and an invitation, not "0 / N".
        <section className="pattern-shippo order-4 mx-4 rounded-[1.75rem] bg-surface p-4 wide:order-none">
          <JourneyFacts facts={journeyFacts(rally, routes)} />
        </section>
      ) : (
        <section className="order-4 mx-4 flex flex-col gap-3 rounded-[1.75rem] bg-surface p-4 wide:order-none">
          <p className="text-6xl font-bold leading-none tabular-nums text-accent">
            {stamped}
            <span className="ml-2 text-3xl text-muted">/ {rally.total}</span>
          </p>
          <Bar stamped={stamped} total={rally.total} label={i18n._(msg`スタンプの進み具合`)} />
          <p className="text-xl font-bold">{stamped === 0 ? <Trans>まだスタンプはありません。</Trans> : <Trans>あと{rally.total - stamped}か所</Trans>}</p>
          <LastUpdated iso={detail.updatedAt} locale={i18n.locale} />
        </section>
      )}

      {!isSoon(rally) ? (
        <section className="order-5 mx-4 flex flex-col gap-3 wide:order-none">
          <Link href={startHref} className={stamped === 0 ? button : quietButton}>
            {stamped === 0 ? <Trans>いますぐはじめる</Trans> : <Trans>つづきをはじめる</Trans>}
          </Link>
          {canStampHere ? <RallyNearbyStamp places={detail.places} held={held} locale={i18n.locale} rallyName={name} quiet={stamped === 0} /> : null}
          <SaveBookmark id={rally.id} />
        </section>
      ) : null}

      {rally.total > 0 ? (
        <section className="order-7 flex flex-col gap-3 px-4 wide:order-none">
          <h2 className="border-l-4 border-brand pl-3 font-serif text-xl font-bold text-accent">
            <Trans>めぐる場所</Trans>
          </h2>
          <RallyBook pages={pages}>
            <RallyTrail places={pages} held={heldSet} locale={i18n.locale} />
          </RallyBook>
        </section>
      ) : null}
      </div>

      {/* The stamp faces: on a phone they come after the buttons, on a wide screen they stand in the right column. */}
      {/* On a wide screen the column also holds the place page that is open (RallyBook), so it scrolls within the screen's height. */}
      <div className="order-6 wide:sticky wide:top-4 wide:order-none wide:flex wide:max-h-[calc(100dvh-2rem)] wide:flex-col wide:gap-4 wide:overflow-y-auto">
      {rally.total > 0 ? (
        <section className="flex flex-col gap-3 px-4 wide:rounded-[1.75rem] wide:bg-surface wide:p-6">
          <h2 className="border-l-4 border-brand pl-3 font-serif text-xl font-bold text-accent">
            <Trans>スタンプ</Trans>
          </h2>
          <StampLegend />
          <StampGrid total={rally.total} stamped={stampedNumbers(rally)} showNext={rally.stamped !== null} />
        </section>
      ) : null}
      <div id={BOOK_SIDE_ID} className="hidden empty:hidden wide:block" />
      </div>
    </div>
  );
}
