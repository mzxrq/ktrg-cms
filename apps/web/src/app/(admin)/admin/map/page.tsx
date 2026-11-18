import type { Metadata } from "next";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { OneMapLoader } from "@/components/admin/one-map/OneMapLoader";
import { initLingui } from "@/i18n/server";
import { adminGet } from "@/lib/admin/admin-fetch";
import { choiceOf } from "@/lib/admin/one-map";
import type { AdminRouteSummary } from "@/lib/admin/types";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export async function generateMetadata(): Promise<Metadata> {
  const i18n = await initLingui();
  return { title: i18n._(msg`地図（管理）`) };
}

// Every course, waypoint and directory place on one map (docs/one-map-editor-design.md, steps 3 and 4: a course is edited in place).
// The course list is read here so the selector has every course, also those off screen; the map loads its area itself.
export default async function OneMapPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const i18n = await initLingui();
  const { course } = await searchParams;
  const { status, body } = await adminGet<{ ok: true; routes: AdminRouteSummary[] }>("/routes");
  const routes = status === 200 && body?.ok ? body.routes : null;

  return (
    <div className="flex flex-col gap-4">
      <AdminPageHeader title={<Trans>地図</Trans>} intro={i18n._(msg`すべてのコース、経由地、お店と施設を、一つの地図で見られます。コースを選ぶと、そのコースが手前に出て、地図がそこへ動きます。「このコースを編集する」で、線と経由地をこの画面のまま直せます。`)} />
      {routes ? (
        <OneMapLoader courses={routes.map(choiceOf)} initialChosen={course ?? null} locale={i18n.locale} />
      ) : (
        <p role="alert" className="rounded-lg border-l-4 border-danger bg-surface p-6 text-lg font-bold text-danger">
          <Trans>読み込めませんでした。しばらくしてから、ページを開き直してください。</Trans>
        </p>
      )}
    </div>
  );
}
