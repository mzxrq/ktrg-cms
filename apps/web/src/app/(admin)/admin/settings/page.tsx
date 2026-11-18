import type { Metadata } from "next";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { SiteSettingsForm } from "@/components/admin/SiteSettingsForm";
import { initLingui } from "@/i18n/server";
import { getMapSettings } from "@/lib/site-settings";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export async function generateMetadata(): Promise<Metadata> {
  const i18n = await initLingui();
  return { title: i18n._(msg`地図の見た目（管理）`) };
}

/** Settings that change the live site for everyone. The API checks the admin role again on every save. */
export default async function SiteSettingsPage() {
  // Every server page sets up its own translations: pages render in parallel with the layout and with metadata, and `Trans` fails without them.
  const i18n = await initLingui();
  const settings = await getMapSettings();
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <AdminPageHeader title={<Trans>地図の見た目</Trans>} intro={i18n._(msg`「地図」ページ、コースのページ、トップページの地図の見え方です。ここで変えたことは、すぐに訪問者の画面に反映されます。`)} />
      <SiteSettingsForm initial={settings} />
    </div>
  );
}
