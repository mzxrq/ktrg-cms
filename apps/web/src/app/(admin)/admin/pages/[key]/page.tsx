import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { AdminBack } from "@/components/admin/AdminBack";
import { PageTextEditor } from "@/components/admin/PageTextEditor";
import { HomeBanners } from "@/components/admin/HomeBanners";
import { HomeSectionsForm } from "@/components/admin/HomeSectionsForm";
import type { BannerItem } from "@/components/admin/BannerOrder";
import { listMetaOr404 } from "@/lib/admin/lists/server";
import { initLingui } from "@/i18n/server";
import { adminGet } from "@/lib/admin/admin-fetch";
import { listBanners, slidesToShow } from "@/lib/banners";
import { listRoutes, sampleContentEnabled } from "@/lib/content";
import { listNotices } from "@/lib/notices";
import { listPosts } from "@/lib/posts";
import { getHomeSections } from "@/lib/site-settings";
import { homeIntroVideo } from "@/lib/video";
import { PAGE_KEYS, type PageKey, type PageText } from "@/lib/page-text";
import { builtInPages } from "@/lib/page-text-server";

export async function generateMetadata(): Promise<Metadata> {
  const i18n = await initLingui();
  return { title: i18n._(msg`ページ（管理）`) };
}

export default async function EditPageText({ params }: { params: Promise<{ key: string }> }) {
  const i18n = await initLingui();
  const { key } = await params;
  if (!(PAGE_KEYS as readonly string[]).includes(key)) notFound();
  const { body } = await adminGet<{ ok: true; pages: Partial<Record<PageKey, PageText | null>> }>("/settings/pages");
  // A page this person may not change is not in the answer (the terms and privacy are for an admin).
  if (!body?.ok || !(key in body.pages)) notFound();
  const saved = body.pages[key as PageKey] ?? null;
  const builtIn = builtInPages()[key as PageKey];
  // The home page's preview shows the real courses, notices and photos around the words being typed.
  const home =
    key === "home"
      ? await Promise.all([listRoutes(), listNotices(), listBanners(), listPosts(), getHomeSections()]).then(([routes, notices, banners, posts, sections]) => ({
          routes,
          notices,
          slides: slidesToShow(banners, sampleContentEnabled()),
          posts,
          showTourism: sections.tourism,
          flow: !sections.pinnedJourney,
          introVideo: homeIntroVideo(),
        }))
      : undefined;
  // The home page also holds its photos and which sections it shows (they were their own screens before 2026-11-16).
  const homeParts =
    key === "home"
      ? await Promise.all([listMetaOr404("banners"), adminGet<{ ok: true; items: BannerItem[] }>("/banners/order")]).then(([meta, order]) => ({
          meta,
          banners: order.status === 200 && order.body?.ok ? order.body.items : null,
        }))
      : undefined;
  return (
    <div className="flex max-w-6xl flex-col gap-4">
      <AdminBack href="/admin/pages">
        <Trans>ページ一覧に戻る</Trans>
      </AdminBack>
      <PageTextEditor pageKey={key as PageKey} saved={saved} builtIn={builtIn} locale={i18n.locale} home={home} />
      {homeParts ? (
        homeParts.banners ? (
          <HomeBanners meta={homeParts.meta} items={homeParts.banners} locale={i18n.locale} />
        ) : (
          <p role="alert" className="rounded-2xl bg-surface p-6 text-lg font-bold text-danger">
            <Trans>バナーを読み込めませんでした。時間をおいてページを再読み込みしてください。</Trans>
          </p>
        )
      ) : null}
      {home ? <HomeSectionsForm initial={{ tourism: home.showTourism, pinnedJourney: !home.flow }} /> : null}
    </div>
  );
}
