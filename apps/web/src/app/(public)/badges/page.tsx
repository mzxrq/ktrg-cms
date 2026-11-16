import type { Metadata } from "next";
import Link from "next/link";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Medal } from "@/components/Medal";
import { BackLink } from "@/components/BackLink";
import { Localized } from "@/components/Localized";
import { EmptyState } from "@/components/EmptyState";
import { initLingui } from "@/i18n/server";
import { listRoutes, pickText } from "@/lib/content";
import { nodeState } from "@/lib/ribbon";
import { PathProgress } from "@/components/RallyViews";

export async function generateMetadata(): Promise<Metadata> {
  const i18n = await initLingui();
  return { title: i18n._(msg`バッジ`) };
}

// One badge for each course: it is earned when every stamp place of the course is stamped. The progress comes from the
// visitor's own stamps (an account's, or a guest's kept in the browser), so everyone sees theirs. In the rally pages' language
// (2026-11-16, docs/rally-design.md): the badges walked so far as the trail with the walker, the badge closest to hand
// called out, and the medals on open ground (space, not boxes), grey until earned.
export default async function BadgesPage() {
  const i18n = await initLingui();
  const routes = (await listRoutes()).filter((r) => r.status === "ready");
  const states = routes.map((r) => nodeState({ status: r.status, stamped: r.stampedCount, total: r.spotCount }));
  const earned = states.filter((s) => s === "complete").length;
  // The badge closest to hand: started, not finished, the fewest stamps left (a tie goes to the earlier course).
  const near = routes
    .map((r, i) => ({ r, left: r.spotCount - (r.stampedCount ?? 0), started: (r.stampedCount ?? 0) > 0 && states[i] !== "complete" }))
    .filter((x) => x.started)
    .sort((a, b) => a.left - b.left)[0];

  return (
    <div className="flex flex-col gap-6 pt-2 wide:pt-0">
      <div className="flex flex-col gap-2 px-4">
        <BackLink href="/rallies">
          <Trans>ラリー</Trans>
        </BackLink>
        <h1 className="font-serif text-3xl font-bold text-accent wide:text-4xl">
          <Trans>バッジ</Trans>
        </h1>
        <p className="max-w-prose text-lg leading-8">
          <Trans>コースのすべての場所でスタンプを押すと、そのコースのバッジがもらえます。</Trans>
        </p>
        {routes.length > 0 ? (
          <div className="flex max-w-xl flex-col gap-1">
            <p className="text-2xl font-bold tabular-nums text-accent">
              <Trans>
                {earned} / {routes.length} コース
              </Trans>
            </p>
            <PathProgress stamped={earned} total={routes.length} label={i18n._(msg`もらったバッジの数`)} />
          </div>
        ) : null}
      </div>

      {near ? (
        <Link href={`/routes/${near.r.id}`} className="tap-target mx-4 flex items-center gap-4 rounded-[1.75rem] bg-surface p-4 no-underline">
          <Medal number={near.r.order} done={false} stamped={near.r.stampedCount ?? 0} total={near.r.spotCount} className="h-20 w-auto shrink-0" />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="text-base font-bold text-muted">
              <Trans>つぎにもらえそうなバッジ</Trans>
            </span>
            <span className="text-xl font-bold leading-snug">
              <Localized value={pickText(i18n.locale, near.r.nameJa, near.r.nameEn)} tag={false} />
            </span>
            <span className="text-lg">
              <Trans>あと{near.left}か所</Trans>
            </span>
          </span>
        </Link>
      ) : null}

      {routes.length === 0 ? (
        <EmptyState title={<Trans>バッジは、まだ準備中です。</Trans>}>
          <Trans>公開できるようになったら、ここにコースのバッジが表示されます。</Trans>
        </EmptyState>
      ) : (
        <ul className="list-in grid grid-cols-2 gap-x-4 gap-y-8 px-4 sm:grid-cols-3 wide:grid-cols-4">
          {routes.map((r, i) => {
            const done = states[i] === "complete";
            return (
              <li key={r.id}>
                <Link href={`/routes/${r.id}`} className="tap-target flex h-full flex-col items-center gap-2 text-center no-underline">
                  <Medal number={r.order} done={done} stamped={r.stampedCount ?? 0} total={r.spotCount} className="h-32 w-auto" />
                  <span className="text-lg font-bold leading-snug">
                    <Localized value={pickText(i18n.locale, r.nameJa, r.nameEn)} tag={false} />
                  </span>
                  <span className="text-base font-bold text-muted">
                    {done ? <Trans>もらいました</Trans> : <span className="tabular-nums">{r.stampedCount ?? 0} / {r.spotCount}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
