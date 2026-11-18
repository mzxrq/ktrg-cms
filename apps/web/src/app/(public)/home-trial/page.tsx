import type { Metadata } from "next";
import { Landing } from "@/components/landing/Landing";
import { listBanners, slidesToShow } from "@/lib/banners";
import { listRoutes, sampleContentEnabled } from "@/lib/content";
import { listNotices } from "@/lib/notices";
import { homePhotosFor, homeTextFor } from "@/lib/page-text-server";
import { listPosts } from "@/lib/posts";
import { getHomeSections, getMapSettings } from "@/lib/site-settings";
import { homeIntroVideo } from "@/lib/video";
import { initLingui } from "@/i18n/server";

// A trial of the home page (2026-11-18), apart from the real one, which went to the committee as it is: the journey scrolls with
// the page instead of being pinned. Linked from nowhere and kept out of search.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function HomeTrialPage() {
  const i18n = await initLingui();
  const [routes, notices, banners, posts, sections, text, chapterPhotos, mapLook] = await Promise.all([listRoutes(), listNotices(), listBanners(), listPosts(), getHomeSections(), homeTextFor(i18n.locale), homePhotosFor(i18n.locale), getMapSettings()]);
  // Always the first-time visitor's page, signed in or not, so the people trying it see the journey.
  return (
    <Landing
      flow
      locale={i18n.locale}
      routes={routes}
      notices={notices}
      introVideo={homeIntroVideo()}
      slides={slidesToShow(banners, sampleContentEnabled())}
      posts={posts}
      showTourism={sections.tourism}
      text={text}
      chapterPhotos={chapterPhotos}
      mapLook={mapLook}
    />
  );
}
