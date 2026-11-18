import type { Metadata } from "next";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { OneMapLoader } from "@/components/admin/one-map/OneMapLoader";
import { initLingui } from "@/i18n/server";
import { adminGet } from "@/lib/admin/admin-fetch";
import { choiceOf } from "@/lib/admin/one-map";
import type { AdminRouteSummary } from "@/lib/admin/types";

export async function generateMetadata(): Promise<Metadata> {
  const i18n = await initLingui();
  return { title: i18n._(msg`地図（管理）`) };
}

// Every course, waypoint and directory place on one map (docs/one-map-editor-design.md, step 3; read only for now).
// The course list is read here so the selector has every course, also those off screen; the map loads its area itself.
export default async function OneMapPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  await initLingui();
  const { course } = await searchParams;
  const { status, body } = await adminGet<{ ok: true; routes: AdminRouteSummary[] }>("/routes");
  const routes = status === 200 && body?.ok ? body.routes : null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">
        <Trans>地図</Trans>
      </h1>
      <p className="text-lg text-muted">
        <Trans>すべてのコース、経由地、お店と施設を、一つの地図で見られます。コースを選ぶと、そのコースが手前に出て、地図がそこへ動きます。編集は、それぞれの画面で行います。</Trans>
      </p>
      {routes ? (
        <OneMapLoader courses={routes.map(choiceOf)} initialChosen={course ?? null} />
      ) : (
        <p role="alert" className="rounded-lg border-l-4 border-danger bg-surface p-6 text-lg font-bold text-danger">
          <Trans>読み込めませんでした。しばらくしてから、ページを開き直してください。</Trans>
        </p>
      )}
    </div>
  );
}
