"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { useErrorMessages } from "@/components/useErrorMessages";
import { api } from "@/lib/api";
import { outcome } from "@/lib/admin/admin-client";
import type { ListItem, ListMeta } from "@/lib/admin/lists/config";
import { listRequest, type OneItem } from "@/lib/admin/lists/list-client";
import { moveId } from "@/lib/admin/route-list";
import { showToast } from "@/lib/admin/toast";
import { AdminItemForm } from "./AdminItemForm";
import { Chip } from "./Chip";
import { MoveButtons, OrderBadge } from "./list-parts";

export type BannerItem = { id: string; imageUrl: string; altJa: string; altEn: string | null; published: boolean };

/**
 * The banners from the top down, each with its photo: the arrows change the order at once. A banner's name opens its form
 * just under it, in place, as a new banner's does (2026-11-17, user: editing should not leave the home screen either).
 */
export function BannerOrder({ initial, meta, locale }: { initial: BannerItem[]; meta: ListMeta; locale: string }) {
  const { t } = useLingui();
  const messages = useErrorMessages();
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState(false);
  // The banner being edited: its id at once, its whole row once loaded.
  const [open, setOpen] = useState<{ id: string; item: ListItem | null } | null>(null);

  async function move(id: string, step: -1 | 1) {
    if (busy) return;
    const before = items;
    const ids = moveId(items.map((b) => b.id), id, step);
    const byId = new Map(items.map((b) => [b.id, b]));
    setItems(ids.map((i) => byId.get(i)!));
    setBusy(true);
    const res = await outcome(api.admin.banners.order.put({ ids }));
    if (!res.ok) {
      setItems(before); // the order on screen must be the order that was saved
      showToast({ kind: "error", text: messages[res.key] });
    }
    setBusy(false);
  }

  async function toggle(id: string) {
    if (open?.id === id) return setOpen(null);
    setOpen({ id, item: null });
    const res = await listRequest<OneItem>("GET", `${meta.key}/${encodeURIComponent(id)}`);
    if (!res.ok) {
      setOpen(null);
      return showToast({ kind: "error", text: messages[res.key] });
    }
    // Only if that banner is still the open one (another may have been tapped meanwhile).
    setOpen((now) => (now?.id === id ? { id, item: res.data.item } : now));
  }

  function saved(item: ListItem) {
    setItems((all) =>
      all.map((b) =>
        b.id === item.id
          ? { ...b, imageUrl: String(item.imageUrl ?? b.imageUrl), altJa: String(item.altJa ?? b.altJa), altEn: typeof item.altEn === "string" ? item.altEn : null, published: item.published === true }
          : b,
      ),
    );
    setOpen(null);
    router.refresh();
  }

  function removed(id: string) {
    setItems((all) => all.filter((b) => b.id !== id));
    setOpen(null);
    showToast({ kind: "ok", text: t`バナーを削除しました。` });
    router.refresh();
  }

  if (items.length === 0) return <p className="rounded-2xl bg-surface p-6 text-lg">{t`バナーがまだありません。「新しいバナー」から作ってください。`}</p>;
  return (
    <ol className="flex flex-col divide-y divide-line rounded-2xl border border-line">
      {items.map((b, i) => {
        const name = locale === "en" && b.altEn ? b.altEn : b.altJa;
        const editing = open?.id === b.id;
        return (
          <li key={b.id} className="flex flex-wrap items-center gap-3 p-3">
            <OrderBadge n={i + 1} />
            {/* eslint-disable-next-line @next/next/no-img-element -- an admin's own photo, on any allowed host */}
            <img src={b.imageUrl} alt="" className="h-20 w-32 shrink-0 rounded-md bg-surface object-cover" />
            <div className="flex min-w-40 flex-1 flex-col items-start gap-1">
              <button
                type="button"
                onClick={() => void toggle(b.id)}
                aria-expanded={editing}
                className="cursor-pointer break-words text-left text-lg font-bold text-accent underline underline-offset-4"
              >
                {name}
              </button>
              <Chip tone={b.published ? "good" : "neutral"}>{b.published ? t`公開中` : t`下書き`}</Chip>
            </div>
            <MoveButtons name={name} canEarlier={i > 0} canLater={i < items.length - 1} onMove={(step) => void move(b.id, step)} busy={busy} />
            {editing ? (
              <div className="basis-full rounded-2xl border-2 border-line bg-paper p-4 sm:p-5">
                <div className="mb-3 flex justify-end">
                  <button type="button" onClick={() => setOpen(null)} className="tap-target rounded-full border border-line px-5 text-lg font-bold">
                    {t`閉じる`}
                  </button>
                </div>
                {open.item ? (
                  <AdminItemForm meta={meta} initial={open.item} locale={locale} choices={{}} onSaved={saved} onRemoved={() => removed(b.id)} />
                ) : (
                  <p role="status" className="text-lg">
                    {t`読み込んでいます…`}
                  </p>
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
