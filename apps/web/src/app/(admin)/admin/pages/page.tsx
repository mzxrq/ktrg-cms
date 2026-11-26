import type { Metadata } from "next";
import Link from "next/link";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { initLingui } from "@/i18n/server";
import { adminGet } from "@/lib/admin/admin-fetch";
import { ChevronIcon } from "@/components/icons";
import type { PageKey, PageText } from "@/lib/page-text";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export async function generateMetadata(): Promise<Metadata> {
  const i18n = await initLingui();
  return { title: i18n._(msg`ページ（管理）`) };
}

/** The fixed pages whose text can be replaced: the editor sees the FAQ and how to play, an admin the terms and privacy too. */
export default async function PageTextList() {
  const i18n = await initLingui();
  const { body } = await adminGet<{ ok: true; pages: Partial<Record<PageKey, PageText | null>> }>("/settings/pages");
  const pages = body?.ok ? body.pages : {};
  const names: Record<PageKey, { name: string; hint: string }> = {
    home: { name: i18n._(msg`ホーム`), hint: i18n._(msg`トップページの見出しと説明。`) },
    faq: { name: i18n._(msg`よくあるご質問`), hint: i18n._(msg`質問と回答の一覧。`) },
    guide: { name: i18n._(msg`遊び方`), hint: i18n._(msg`導入文と利用手順`) },
    terms: { name: i18n._(msg`利用規約`), hint: i18n._(msg`法的な文書。管理者のみ編集許可。`) },
    privacy: { name: i18n._(msg`プライバシーポリシー`), hint: i18n._(msg`法的な文書。管理者のみ編集許可。`) },
  };
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <AdminPageHeader title={<Trans>ページ</Trans>} intro={i18n._(msg`アプリ標準の固定ページの本文を編集できます。未入力の場合はデフォルトの文章が表示されます。`)} />
      <ul className="flex flex-col gap-3">
        {(Object.keys(pages) as PageKey[]).map((key) => {
          const mine = pages[key];
          const own = !!mine && (mine.ja.body.trim() !== "" || mine.en.body.trim() !== "");
          return (
            <li key={key}>
              <Link href={`/admin/pages/${key}`} className="tap-target flex items-center justify-between gap-3 rounded-full bg-surface p-5 hover:bg-paper">
                <span>
                  <span className="block text-xl font-bold">{names[key].name}</span>
                  <span className="block text-base text-muted">{names[key].hint}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-base font-bold">
                  {own ? <Trans>編集済み</Trans> : <Trans>デフォルト</Trans>}
                  <ChevronIcon />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="border-t border-line pt-5 text-lg text-muted">
        <Trans>新しくページを追加する場合は、「記事とページ」から作成してください（種類で「ページ」を選択）。</Trans>{" "}
        <Link href="/admin/posts" className="font-bold text-accent underline underline-offset-4">
          <Trans>記事とページへ</Trans>
        </Link>
      </p>
    </div>
  );
}
