import { FuriganaOverview } from "@/components/admin/FuriganaOverview";
import { FuriganaWords } from "@/components/admin/FuriganaWords";
import type { Metadata } from "next";
import Link from "next/link";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { AdminBack } from "@/components/admin/AdminBack";
import { AdminListTable } from "@/components/admin/AdminListTable";
import { initLingui } from "@/i18n/server";
import { adminGet } from "@/lib/admin/admin-fetch";
import { pick } from "@/lib/admin/lists/config";
import type { ListPage } from "@/lib/admin/lists/list-client";
import { listMetaOr404, relationChoices } from "@/lib/admin/lists/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

export async function generateMetadata({ params }: { params: Promise<{ list: string }> }): Promise<Metadata> {
  const i18n = await initLingui();
  const title = pick((await listMetaOr404((await params).list)).title, i18n.locale);
  return { title: i18n._(msg`${title}（管理）`) };
}

/** Any generic admin list, drawn from the API's description of it: newest first, 50 at a time. */
export default async function AdminListPage({ params }: { params: Promise<{ list: string }> }) {
  const i18n = await initLingui();
  const meta = await listMetaOr404((await params).list);
  const [{ status, body }, choices] = await Promise.all([adminGet<{ ok: true } & ListPage>(`/lists/${meta.key}?page=1`), relationChoices(meta, i18n.locale)]);
  // The whole answer, not just the rows: it carries which page this is, how many there are and the total the pager needs.
  const page: ListPage | null = status === 200 && body?.ok ? body : null;
  const title = pick(meta.title, i18n.locale);

  return (
    // As wide as the course list, so the columns (dates, chips) do not wrap.
    <div className={`flex flex-col gap-5 ${meta.key === "furigana" ? "max-w-screen-2xl" : "max-w-6xl"}`}>
      {meta.key === "authors" || meta.key === "tags" ? (
        <AdminBack href="/admin/posts">
          <Trans>ブログへ戻る</Trans>
        </AdminBack>
      ) : null}
      {/* The list draws its own title, beside its "new" button (like the course list); the others need it here. */}
      {page && meta.key !== "furigana" ? null : (
        <>
          <AdminPageHeader title={title} intro={pick(meta.intro, i18n.locale)} />
        </>
      )}
      {page && meta.key === "furigana" ? (
        // The readings on the left; the two waiting lists (names to read, dictionary readings to check) in a column on the
        // right of a wide screen, so they no longer push the list down (2026-11-18, user); below the list on a narrow one.
        <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,1fr)_26rem] xl:items-start">
          <div className="flex min-w-0 flex-col gap-4">
            <h2 className="text-xl font-bold text-accent">
              <Trans>表示している読み</Trans>
            </h2>
            {/* Readings are edited in place (no page per word); drawn afresh when approving beside it changes the server's first page. */}
            <FuriganaWords key={`${page.total ?? ""}:${page.items[0]?.id ?? ""}`} initial={page} />
          </div>
          <aside className="flex flex-col gap-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
            <FuriganaOverview />
          </aside>
        </div>
      ) : page ? (
        <AdminListTable meta={meta} initial={page} locale={i18n.locale} choices={choices}>
          {meta.key === "posts" ? (
            <div className="flex flex-wrap gap-x-6">
              <Link href="/admin/authors" className="tap-target inline-flex w-fit items-center text-base underline underline-offset-4">
                <Trans>書き手を管理する</Trans>
              </Link>
              <Link href="/admin/tags" className="tap-target inline-flex w-fit items-center text-base underline underline-offset-4">
                <Trans>タグを管理する</Trans>
              </Link>
            </div>
          ) : null}
        </AdminListTable>
      ) : (
        <p role="alert" className="rounded-2xl bg-surface p-6 text-lg font-bold text-danger">
          <Trans>{title}を読み込めませんでした。しばらくしてから、ページを開き直してください。</Trans>
        </p>
      )}
    </div>
  );
}
