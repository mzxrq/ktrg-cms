"use client";

import { useState, type FormEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import { buttonStyle } from "@/components/button";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Pager } from "@/components/Pager";
import { useErrorMessages } from "@/components/useErrorMessages";
import { showToast } from "@/lib/admin/toast";
import { listRequest, type ListPage, type OneItem } from "@/lib/admin/lists/list-client";
import { parseRuby } from "@/lib/ruby";
import { inputClass } from "./fields";
import { RubyPreview } from "./FuriganaOverview";

type Word = { id: string; word: string; reading: string; always: boolean; updatedAt: string };
const asWord = (i: Record<string, unknown>): Word => ({ id: String(i.id), word: String(i.word), reading: String(i.reading), always: i.always === true, updatedAt: String(i.updatedAt) });

/** Shown in a message as is (braces in a message would be read as a placeholder). */
export const MARKUP_EXAMPLE = "漢字{よみ}";

/** The reading as one run of kana ("葛城山{かつらぎさん}" -> "かつらぎさん"); the server lines it up with the kanji again. */
export const plainReading = (markup: string) => (parseRuby(markup) ?? []).map((p) => p.reading ?? p.text).join("") || markup;

/**
 * The shown readings, edited where they are (2026-11-16, user: no page per word): a line at the top adds a word, each row's
 * reading is typed in place and saved with Enter or 保存, いつも表示する is one tick, and a search narrows the list.
 */
export function FuriganaWords({ initial }: { initial: ListPage }) {
  const { t } = useLingui();
  const messages = useErrorMessages();
  const [rows, setRows] = useState<Word[]>(initial.items.map(asWord));
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [page, setPage] = useState(initial.page ?? 1);
  const [pages, setPages] = useState(initial.pages ?? 1);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState({ word: "", reading: "", always: false });

  async function load(n: number, words = q) {
    setBusy(true);
    const res = await listRequest<ListPage>("GET", `furigana?${words.trim() ? `q=${encodeURIComponent(words.trim())}&` : ""}page=${n}`);
    setBusy(false);
    if (!res.ok) return showToast({ kind: "error", text: messages[res.key] });
    setRows(res.data.items.map(asWord));
    setPage(res.data.page ?? 1);
    setPages(res.data.pages ?? 1);
    setTyped({});
  }

  /** Send a change to one row; on success the row takes the server's answer (its new reading and time). */
  async function save(row: Word, changes: Partial<Pick<Word, "reading" | "always">>) {
    if (busy) return;
    setBusy(true);
    const res = await listRequest<OneItem>("PATCH", `furigana/${row.id}`, { updatedAt: row.updatedAt, word: row.word, ...changes });
    setBusy(false);
    if (!res.ok) return showToast({ kind: "error", text: res.key === "validation_failed" ? t`読みが言葉に合いません。ひらがなで入れるか、漢字ごとに「${MARKUP_EXAMPLE}」と入れてください。` : messages[res.key] });
    const saved = asWord(res.data.item);
    setRows((all) => all.map((r) => (r.id === row.id ? saved : r)));
    setTyped((all) => Object.fromEntries(Object.entries(all).filter(([id]) => id !== row.id)));
    showToast({ kind: "ok", text: t`「${row.word}」を保存しました。` });
  }

  async function remove(row: Word) {
    if (busy || !(await confirmDialog({ title: t`「${row.word}」のふりがなを削除しますか？`, yes: t`削除する` }))) return;
    setBusy(true);
    const res = await listRequest("DELETE", `furigana/${row.id}`);
    setBusy(false);
    if (!res.ok) return showToast({ kind: "error", text: messages[res.key] });
    setRows((all) => all.filter((r) => r.id !== row.id));
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (busy || !add.word.trim() || !add.reading.trim()) return;
    setBusy(true);
    const res = await listRequest<OneItem>("POST", "furigana", add);
    setBusy(false);
    if (!res.ok) {
      const text = res.key === "conflict" ? t`この言葉はもう一覧にあります。` : res.key === "validation_failed" ? t`漢字を含む言葉と、それに合う読みを入れてください。` : messages[res.key];
      return showToast({ kind: "error", text });
    }
    setRows((all) => [asWord(res.data.item), ...all]);
    setAdd({ word: "", reading: "", always: false });
    showToast({ kind: "ok", text: t`言葉を加えました。訪れる人に表示されます。` });
  }

  const tick = "size-5 shrink-0 accent-[var(--color-brand)]";
  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={(e) => void create(e)} className="flex flex-col gap-3 rounded-2xl bg-surface p-4 sm:p-5" aria-label={t`言葉を加える`}>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <label className="flex flex-col gap-1 text-base font-bold">
            {t`言葉`}
            <input value={add.word} onChange={(e) => setAdd({ ...add, word: e.target.value })} placeholder={t`例：臥薪嘗胆`} className={inputClass} maxLength={40} />
          </label>
          <label className="flex flex-col gap-1 text-base font-bold">
            {t`読み（ひらがな）`}
            <input value={add.reading} onChange={(e) => setAdd({ ...add, reading: e.target.value })} placeholder={t`例：がしんしょうたん`} className={inputClass} maxLength={120} />
          </label>
          <button type="submit" disabled={busy || !add.word.trim() || !add.reading.trim()} className={buttonStyle("action", "md", "inline-flex self-end")}>
            {t`加える`}
          </button>
        </div>
        <label className="tap-target inline-flex w-fit items-center gap-2 text-lg">
          <input type="checkbox" className={tick} checked={add.always} onChange={(e) => setAdd({ ...add, always: e.target.checked })} />
          {t`いつも表示する（とても難しい字や四字熟語に）`}
        </label>
      </form>

      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void load(1);
        }}
        className="flex gap-2"
      >
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} aria-label={t`言葉をさがす`} placeholder={t`言葉をさがす`} className={inputClass} />
        <button type="submit" disabled={busy} className={buttonStyle("secondary", "md", "inline-flex shrink-0")}>
          {t`さがす`}
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="text-lg text-muted">{q.trim() ? t`見つかりませんでした。` : t`まだ言葉がありません。`}</p>
      ) : (
        <ul className="divide-y divide-line/40 border-y border-line/40">
          {rows.map((row) => {
            const value = typed[row.id] ?? plainReading(row.reading);
            const changed = typed[row.id] !== undefined && typed[row.id]!.trim() !== plainReading(row.reading);
            return (
              <li key={row.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2">
                <span className="min-w-[8rem]">
                  <RubyPreview word={row.word} reading={row.reading} />
                </span>
                <form
                  className="flex min-w-[12rem] flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (changed) void save(row, { reading: value.trim() });
                  }}
                >
                  <input value={value} onChange={(e) => setTyped({ ...typed, [row.id]: e.target.value })} aria-label={t`「${row.word}」の読み`} className={inputClass} maxLength={120} />
                  {changed ? (
                    <button type="submit" disabled={busy} className={buttonStyle("action", "sm", "inline-flex shrink-0")}>
                      {t`保存`}
                    </button>
                  ) : null}
                </form>
                <label className="tap-target inline-flex items-center gap-2 text-base">
                  <input type="checkbox" className={tick} checked={row.always} disabled={busy} onChange={(e) => void save(row, { always: e.target.checked })} />
                  {t`いつも表示`}
                </label>
                <button type="button" disabled={busy} onClick={() => void remove(row)} className={buttonStyle("secondary", "sm", "inline-flex")}>
                  {t`削除`}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Pager page={page} pages={pages} onPage={(n) => void load(n)} disabled={busy} hideWhenSingle />
    </div>
  );
}
