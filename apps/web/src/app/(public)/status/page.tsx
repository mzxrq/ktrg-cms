import type { Metadata } from "next";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { BackLink } from "@/components/BackLink";
import { StatusChecks } from "@/components/StatusChecks";
import { initLingui } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const i18n = await initLingui();
  return { title: i18n._(msg`サイトの状態`) };
}

// Is the site working right now: the API and its database, checked when the page opens (no outside service watches it).
export default async function StatusPage() {
  await initLingui(); // sets the language for <Trans> in this render (generateMetadata is a separate one)
  return (
    <div className="page-narrow flex flex-col gap-6 px-4 pt-2">
      <BackLink href="/">
        <Trans>ホーム</Trans>
      </BackLink>
      <h1 className="font-serif text-3xl font-bold text-accent">
        <Trans>サイトの状態</Trans>
      </h1>
      <p className="text-lg">
        <Trans>このページを開いたときに、サイトが動いているかを確かめます。スタンプが押せない、ログインできないときは、ここを見てください。</Trans>
      </p>
      <StatusChecks />
    </div>
  );
}
