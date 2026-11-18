"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { showToast } from "@/lib/admin/toast";
import type { ListMeta } from "@/lib/admin/lists/config";
import { pick } from "@/lib/admin/lists/config";
import { AdminItemForm } from "./AdminItemForm";
import { BannerOrder, type BannerItem } from "./BannerOrder";
import { useDiscardCheck } from "./useDiscardCheck";

/**
 * The home page's photos, on the home page's own screen (2026-11-16, user: banners are only the home carousel, so no
 * page of their own): their order, a new one added in place, and one edited in place (BannerOrder, 2026-11-17).
 */
export function HomeBanners({ meta, items, locale }: { meta: ListMeta; items: BannerItem[]; locale: string }) {
  const { t } = useLingui();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const { onDirtyChange, okToClose } = useDiscardCheck();
  return (
    <section id="banners" aria-labelledby="banners-title" className="flex scroll-mt-24 flex-col gap-4 rounded-2xl bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="banners-title" className="text-2xl font-bold">
          {pick(meta.title, locale)}
        </h2>
        <button type="button" onClick={async () => {
            // Closing a half-filled new banner asks first, like leaving the page would.
            if (!adding || (await okToClose())) setAdding(!adding);
          }} aria-expanded={adding} className="tap-target inline-flex items-center rounded-full bg-create px-5 text-lg font-bold text-on-create">
          {adding ? t`閉じる` : pick(meta.newLabel ?? meta.title, locale)}
        </button>
      </div>
      <p className="text-lg text-muted">{pick(meta.intro, locale)}</p>
      {adding ? (
        <div className="rounded-2xl border-2 border-line bg-paper p-4 sm:p-5">
          <AdminItemForm
            meta={meta}
            initial={null}
            locale={locale}
            choices={{}}
            onDirtyChange={onDirtyChange}
            onCreated={() => {
              setAdding(false);
              showToast({ kind: "ok", text: t`バナーを加えました。` });
              router.refresh();
            }}
          />
        </div>
      ) : null}
      {/* Drawn afresh when the server's list changes (a banner added above). */}
      <BannerOrder key={items.map((b) => b.id).join()} initial={items} meta={meta} locale={locale} />
    </section>
  );
}
