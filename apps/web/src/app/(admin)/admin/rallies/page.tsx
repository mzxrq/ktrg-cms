import type { Metadata } from "next";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { RallyList } from "@/components/admin/RallyList";
import { initLingui } from "@/i18n/server";
import { adminGet } from "@/lib/admin/admin-fetch";
import type { AdminRally } from "@/lib/admin/types";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export async function generateMetadata(): Promise<Metadata> {
  const i18n = await initLingui();
  return { title: i18n._(msg`ラリー（管理）`) };
}

export default async function AdminRalliesPage() {
  const i18n = await initLingui();
  const { status, body } = await adminGet<{ ok: true; rallies: AdminRally[] }>("/rallies");
  const rallies = status === 200 && body?.ok ? body.rallies : null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <AdminPageHeader title={<Trans>ラリー</Trans>} intro={i18n._(msg`ラリーは、コースを集めてつくるか、経由地を集めてつくります。名前を押すと、名前・公開・中身を直せます。`)} />
      {rallies ? (
        <RallyList initial={rallies} locale={i18n.locale} />
      ) : (
        <p role="alert" className="rounded-2xl bg-surface p-6 text-lg font-bold text-danger">
          <Trans>ラリーを読み込めませんでした。しばらくしてから、ページを開き直してください。</Trans>
        </p>
      )}
    </div>
  );
}
