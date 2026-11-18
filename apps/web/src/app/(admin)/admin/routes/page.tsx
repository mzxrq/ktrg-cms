import type { Metadata } from "next";
import Link from "next/link";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { RouteTable } from "@/components/admin/RouteTable";
import { initLingui } from "@/i18n/server";
import { adminGet } from "@/lib/admin/admin-fetch";
import type { AdminRouteSummary } from "@/lib/admin/types";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export async function generateMetadata(): Promise<Metadata> {
  const i18n = await initLingui();
  return { title: i18n._(msg`コース（管理）`) };
}

export default async function AdminRoutesPage() {
  const i18n = await initLingui();
  const { status, body } = await adminGet<{ ok: true; routes: AdminRouteSummary[] }>("/routes");
  const routes = status === 200 && body?.ok ? body.routes : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <AdminPageHeader title={<Trans>コース</Trans>} intro={i18n._(msg`歩く順番に並んでいます。名前を押すと、文章や地図を直せます。`)}>
        <Link href="/admin/routes/new" className="tap-target inline-flex items-center rounded-full bg-ink px-5 text-lg font-bold text-paper">
          <Trans>新しいコース</Trans>
        </Link>
      </AdminPageHeader>
      {routes ? (
        <RouteTable initial={routes} locale={i18n.locale} />
      ) : (
        <p role="alert" className="rounded-2xl bg-surface p-6 text-lg font-bold text-danger">
          <Trans>コースを読み込めませんでした。しばらくしてから、ページを開き直してください。</Trans>
        </p>
      )}
    </div>
  );
}
