"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { Pager } from "@/components/Pager";
import { useErrorMessages } from "@/components/useErrorMessages";
import { Chip } from "./Chip";
import { FilterGroup, HeaderFilter, SortHeader } from "./list-parts";
import { DuplicateFinder } from "./DuplicateFinder";
import { PlaceImport } from "./PlaceImport";
import { AdminItemForm } from "./AdminItemForm";
import { useDiscardCheck } from "./useDiscardCheck";
import { showToast } from "@/lib/admin/toast";
import { inputClass } from "./fields";
import { cellOf, itemHref, itemName, listColumns, nameIsFallback, pick, type FieldUi, type ListMeta } from "@/lib/admin/lists/config";
import { listRequest, type ListPage } from "@/lib/admin/lists/list-client";
import { nextSort, sortItems, type Sort } from "@/lib/admin/lists/sort";
import { confirmDialog } from "@/components/ConfirmDialog";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

// A soft shadow on the right edge while more columns wait to be scrolled to (the cover is `local`, so it moves away at the end).
const edgeShadow = { background: "linear-gradient(to left, var(--color-paper) 30%, transparent) right / 2.5rem 100% local no-repeat, linear-gradient(to left, rgb(0 0 0 / 0.18), transparent) right / 0.9rem 100% scroll no-repeat" };

// Quiet text buttons on the count row (as the course list's ひな形 / 取り込む).
const quiet = "tap-target inline-flex items-center px-2 text-base underline underline-offset-4";

// Any generic admin list, drawn from its description (GET /admin/lists), laid out like the course list (RouteTable,
// 2026-11-17, user): the title with its "new" button, a search box that searches as you type, the count with the list's
// own tools as quiet links, and a table whose column headers sort and filter (a card per row on a phone).
// Newest first, 50 to a page; the pager goes to the next or previous page or to a page typed in.
export function AdminListTable({
  meta: config,
  initial,
  locale,
  choices,
  children,
}: {
  meta: ListMeta;
  initial: ListPage;
  locale: string;
  choices: Record<string, { id: string; name: string; detail?: string }[]>;
  /** Shown under the intro (the blog's links to its writers and tags). */
  children?: ReactNode;
}) {
  const { t } = useLingui();
  const messages = useErrorMessages();
  const [items, setItems] = useState(initial.items);
  const [page, setPage] = useState(initial.page ?? 1);
  const [pages, setPages] = useState(initial.pages ?? 1);
  const [total, setTotal] = useState(initial.total ?? initial.items.length);
  const [capped, setCapped] = useState(initial.capped ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The rows ticked for deleting (only a list that can delete shows the boxes).
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  // What the list is narrowed by: the search words and "field value" choices (as typed, and as last applied).
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState("");
  // The order of the rows on the page: the list's own (newest first) until a column header is pressed.
  const [sort, setSort] = useState<Sort>(null);
  // The directory's own tools, opened from the count row.
  const [tool, setTool] = useState<"import" | "duplicates" | null>(null);
  const base = `/admin/${config.key}`;
  // A short form (a notice, a banner, a tag) opens above the list instead of on its own page (2026-11-16, user); a long one
  // (a post with its editor, a directory place with its map) keeps its page.
  const inlineNew = config.fields.length <= 8 && !config.fields.some((f) => f.kind === "bilingual-long" || f.kind === "decimal");
  const [adding, setAdding] = useState(false);
  const { onDirtyChange, okToClose } = useDiscardCheck();
  const name = (item: (typeof items)[number]) => itemName(config, item, locale);
  const title = pick(config.title, locale);
  const columns = listColumns(config);
  const lookup = (id: string, field: string) => choices[field]?.find((c) => c.id === id)?.name ?? null;
  const rows = useMemo(() => sortItems(items, config, sort, locale, lookup), [items, config, sort, locale]); // eslint-disable-line react-hooks/exhaustive-deps -- lookup only reads `choices`

  const filterFields = config.fields.filter((f) => f.kind === "select" || f.kind === "boolean" || f.kind === "route" || f.kind === "relation");
  const isFilter = (f: FieldUi) => filterFields.some((x) => x.name === f.name);
  // On a wide screen a column's filter sits in its header; a filter with no column waits behind "other filters".
  const otherFilters = filterFields.filter((f) => !columns.some((c) => c.name === f.name));
  // On a phone (no table) the short ones are rows of buttons and the rest lists, all in one fold.
  const buttonFilters = filterFields.filter((f) => f.inList && f.kind !== "route" && f.kind !== "relation" && filterChoices(f, locale).length <= 6);
  const listFilters = filterFields.filter((f) => !buttonFilters.includes(f));
  const pickedCount = filterFields.filter((f) => (picked[f.name] ?? "") !== "").length;
  const otherPicked = otherFilters.filter((f) => (picked[f.name] ?? "") !== "").length;

  const queryOf = (words: string, choices: Record<string, string>) => {
    const params = new URLSearchParams();
    if (words.trim()) params.set("q", words.trim());
    for (const [name, value] of Object.entries(choices)) if (value !== "") params.append("filter", `${name}:${value}`);
    return params.toString();
  };

  /**
   * Read the first page again with the search words and choices. It runs as the words are typed, so a newer search wins:
   * an answer that comes back after a later search started is dropped.
   */
  const latestSearch = useRef(0);
  async function search(words: string, choices: Record<string, string>) {
    const mine = ++latestSearch.current;
    setBusy(true);
    setError(null);
    setTicked(new Set()); // what was ticked may no longer be on the page
    const query = queryOf(words, choices);
    const res = await listRequest<ListPage>("GET", `${config.key}?${query ? `${query}&` : ""}page=1`);
    if (mine !== latestSearch.current) return;
    setBusy(false);
    if (!res.ok) return setError(messages[res.key]);
    show(res.data);
    setApplied(query);
  }

  // Search as the words are typed (like the course list), a moment after the last key, not on every key.
  const typed = useRef(false);
  useEffect(() => {
    if (!typed.current) return;
    const timer = setTimeout(() => void search(q, picked), 400);
    return () => clearTimeout(timer);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps -- only the words start a search here; a filter starts its own

  const setFilter = (field: string, value: string) => {
    const next = { ...picked, [field]: value };
    setPicked(next);
    void search(q, next);
  };
  /** The choices a filter offers: a select's or yes/no's own words, or the rows a route or relation field can point to. */
  const optionsOf = (f: FieldUi) => (f.kind === "select" || f.kind === "boolean" ? filterChoices(f, locale) : (choices[f.name] ?? []).map((c) => ({ value: c.id, text: c.name })));

  /** Put a page the API sent on the screen. */
  function show(data: ListPage) {
    setItems(data.items);
    setPage(data.page ?? 1);
    setPages(data.pages ?? 1);
    setTotal(data.total ?? data.items.length);
    setCapped(data.capped ?? false);
  }

  /** Go to a page of the list as it is narrowed now. Returns false when it could not be read. */
  async function goTo(n: number): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    setTicked(new Set());
    const res = await listRequest<ListPage>("GET", `${config.key}?${applied ? `${applied}&` : ""}page=${n}`);
    setBusy(false);
    if (!res.ok) {
      setError(messages[res.key]);
      return false;
    }
    show(res.data);
    return true;
  }

  /** Delete rows one by one; the ones that went are dropped from the page, and what could not be deleted is reported. */
  async function removeRows(ids: string[]) {
    if (busy || ids.length === 0) return;
    const one = ids.length === 1 ? items.find((i) => i.id === ids[0]) : undefined;
    const ask = one ? (config.deleteWarning ? pick(config.deleteWarning, locale) : t`「${name(one)}」を削除します。元に戻せません。よろしいですか？`) : t`選んだ${ids.length}件を削除します。元に戻せません。よろしいですか？`;
    if (!(await confirmDialog({ title: t`削除しますか？`, body: ask, yes: t`削除する` }))) return;
    setBusy(true);
    setError(null);
    const gone = new Set<string>();
    let failure: string | null = null;
    for (const id of ids) {
      const res = await listRequest("DELETE", `${config.key}/${id}`);
      if (res.ok) gone.add(id);
      else failure = messages[res.key];
    }
    setBusy(false);
    setTicked(new Set());
    if (gone.size > 0) await goTo(page); // the counts and the page change when rows go
    if (failure) setError(gone.size > 0 ? t`${gone.size}件を削除しました。残りは削除できませんでした：${failure}` : failure);
  }

  const canDelete = config.ops.delete;
  const allTicked = items.length > 0 && items.every((i) => ticked.has(i.id));
  const tickAll = () => setTicked(allTicked ? new Set() : new Set(items.map((i) => i.id)));
  const toggle = (id: string) =>
    setTicked((now) => {
      const next = new Set(now);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  /** A list of choices for one filter (used beside the table, where buttons would not fit). */
  const filterSelect = (f: FieldUi) => (
    <label key={f.name} className="flex flex-col gap-1 text-base font-bold">
      {pick(f.label, locale)}
      <select value={picked[f.name] ?? ""} onChange={(e) => setFilter(f.name, e.target.value)} className={inputClass}>
        <option value="">{t`すべて`}</option>
        {optionsOf(f).map((o) => (
          <option key={o.value} value={o.value}>
            {o.text}
          </option>
        ))}
      </select>
    </label>
  );

  const newButton = config.ops.create && config.newLabel ? (
    inlineNew ? (
      <button type="button" onClick={async () => {
          // Closing a half-filled new row asks first (the page guard only asks when the page is left).
          if (!adding || (await okToClose())) setAdding(!adding);
        }}
        aria-expanded={adding} className="tap-target inline-flex items-center rounded-full bg-ink px-5 text-lg font-bold text-paper">
        {adding ? t`閉じる` : pick(config.newLabel, locale)}
      </button>
    ) : (
      <Link href={`${base}/new`} className="tap-target inline-flex items-center rounded-full bg-ink px-5 text-lg font-bold text-paper">
        {pick(config.newLabel, locale)}
      </Link>
    )
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <AdminPageHeader title={title} intro={pick(config.intro, locale)}>
        {newButton}
      </AdminPageHeader>
      {children}

      {inlineNew && adding && config.newLabel ? (
        <section aria-label={pick(config.newLabel, locale)} className="flex flex-col gap-3 rounded-2xl border-2 border-line p-4 sm:p-5">
          <h2 className="text-2xl font-bold">{pick(config.newLabel, locale)}</h2>
          <AdminItemForm
            meta={config}
            initial={null}
            locale={locale}
            choices={choices}
            onDirtyChange={onDirtyChange}
            onCreated={(item) => {
              setItems((all) => [item, ...all]);
              setTotal((n) => n + 1);
              setAdding(false);
              showToast({ kind: "ok", text: t`加えました。` });
            }}
          />
        </section>
      ) : null}

      <div role="search" className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-60 flex-1 flex-col gap-1 text-base font-bold">
          {t`さがす`}
          <input
            type="search"
            value={q}
            maxLength={100}
            onChange={(e) => {
              typed.current = true;
              setQ(e.target.value);
            }}
            placeholder={t`名前やことばの一部を入力`}
            className="tap-target rounded-full border border-line bg-paper px-4 text-lg font-normal"
          />
        </label>
        {applied ? (
          <button
            type="button"
            onClick={() => {
              setQ("");
              setPicked({});
              void search("", {});
            }}
            className="tap-target rounded-full px-3 text-lg font-bold text-accent underline underline-offset-4"
          >
            {t`条件をやめる`}
          </button>
        ) : null}
      </div>

      {/* On a phone the table is hidden, so its header filters are here: buttons for the short ones, lists for the rest. */}
      {filterFields.length > 0 ? (
        <details className="group md:hidden" open={pickedCount > 0 || undefined}>
          <summary className="tap-target flex w-fit cursor-pointer list-none items-center gap-2 text-base font-bold text-accent [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="transition-transform group-open:rotate-90">▸</span>
            {t`絞りこみ`}
            {pickedCount > 0 ? <span className="rounded-full bg-ink px-2 text-sm text-paper">{pickedCount}</span> : null}
          </summary>
          <div className="mt-2 flex flex-col gap-3 rounded-2xl bg-surface p-3">
            {buttonFilters.map((f) => (
              <FilterGroup key={f.name} label={pick(f.label, locale)} options={filterChoices(f, locale)} value={picked[f.name] ?? ""} disabled={busy} onChange={(value) => setFilter(f.name, value)} />
            ))}
            {listFilters.length > 0 ? <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">{listFilters.map(filterSelect)}</div> : null}
          </div>
        </details>
      ) : null}
      {/* On a wide screen, a filter with no column of its own. */}
      {otherFilters.length > 0 ? (
        <details className="group hidden md:block" open={otherPicked > 0 || undefined}>
          <summary className="tap-target flex w-fit cursor-pointer list-none items-center gap-2 text-base font-bold text-accent [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="transition-transform group-open:rotate-90">▸</span>
            {t`ほかの絞りこみ`}
            {otherPicked > 0 ? <span className="rounded-full bg-ink px-2 text-sm text-paper">{otherPicked}</span> : null}
          </summary>
          <div className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">{otherFilters.map(filterSelect)}</div>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-base font-bold text-muted" aria-live="polite">
          {capped ? t`先頭の${total}件を表示しています。` : t`${total}件`}
        </p>
        {canDelete && ticked.size > 0 ? (
          <button type="button" disabled={busy} onClick={() => void removeRows([...ticked])} className="tap-target rounded-full border-2 border-danger px-4 text-base font-bold text-danger disabled:opacity-50">
            {t`選んだ${ticked.size}件を削除`}
          </button>
        ) : null}
        {config.key === "directory" ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-2">
            <button type="button" aria-expanded={tool === "import"} onClick={() => setTool(tool === "import" ? null : "import")} className={quiet}>
              {t`シート（CSV）から取り込む`}
            </button>
            <button type="button" aria-expanded={tool === "duplicates"} onClick={() => setTool(tool === "duplicates" ? null : "duplicates")} className={quiet}>
              {t`重複している場所をさがす`}
            </button>
          </div>
        ) : null}
      </div>
      {tool === "import" ? <PlaceImport onDone={() => void search(q, picked)} /> : null}
      {tool === "duplicates" ? <DuplicateFinder meta={config} locale={locale} choices={choices} onChanged={() => void search(q, picked)} /> : null}

      {error ? (
        <p role="alert" className="rounded-xl bg-surface p-4 text-lg font-bold text-danger">
          {error}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="rounded-2xl bg-surface p-6 text-lg">{applied ? t`条件に合う${title}はありません。` : t`${title}はまだありません。`}</p>
      ) : (
        <>
          {/* A table on a wide screen: one column per fact, so a column can be read from top to bottom. */}
          <div className="relative hidden overflow-x-auto rounded-2xl border border-line md:block" style={edgeShadow}>
            <table className="w-full border-collapse text-left">
              <thead className="bg-surface align-top text-base">
                <tr>
                  {canDelete ? (
                    <th scope="col" className="w-12 p-3">
                      <input type="checkbox" aria-label={t`このページをすべて選ぶ`} checked={allTicked} onChange={tickAll} className="mt-3 size-5" />
                    </th>
                  ) : null}
                  <SortHeader label={t`名前`} sortKey="name" sort={sort} onSort={(key) => setSort(nextSort(sort, key))} />
                  {columns.map((f) => (
                    <SortHeader
                      key={f.name}
                      label={pick(f.label, locale)}
                      sortKey={f.name}
                      sort={sort}
                      onSort={(key) => setSort(nextSort(sort, key))}
                      filter={isFilter(f) ? <HeaderFilter label={pick(f.label, locale)} options={optionsOf(f)} value={picked[f.name] ?? ""} onChange={(value) => setFilter(f.name, value)} /> : undefined}
                    />
                  ))}
                  {canDelete ? <th scope="col" className="w-24 p-3"><span className="sr-only">{t`削除`}</span></th> : null}
                </tr>
              </thead>
              <tbody className="rows-in divide-y divide-line">
                {rows.map((item) => {
                  const href = itemHref(config, item);
                  return (
                    <tr key={item.id} className="align-top hover:bg-surface/60">
                      {canDelete ? (
                        <td className="p-3">
                          <input type="checkbox" aria-label={t`${name(item)}を選ぶ`} checked={ticked.has(item.id)} onChange={() => toggle(item.id)} className="size-5" />
                        </td>
                      ) : null}
                      <td className="max-w-80 p-3">
                        {href ? (
                          <Link href={href} className="break-words text-lg font-bold text-accent underline underline-offset-4">
                            {name(item) || "—"}
                          </Link>
                        ) : (
                          <p className="break-words text-lg font-bold">{name(item) || "—"}</p>
                        )}
                        {nameIsFallback(config, item) ? <p className="text-base text-muted">{String(item[config.titleField] ?? "")}</p> : null}
                      </td>
                      {columns.map((f) => {
                        const cell = cellOf(f, item, locale, lookup);
                        return (
                          <td key={f.name} className="p-3 text-lg">
                            {cell.chip ? cell.text ? <Chip tone={cell.tone}>{cell.text}</Chip> : null : <span className={cell.text === "—" ? "text-muted" : undefined}>{cell.text}</span>}
                          </td>
                        );
                      })}
                      {canDelete ? (
                        <td className="p-3 text-right">
                          <button type="button" disabled={busy} onClick={() => void removeRows([item.id])} className="tap-target rounded-full border border-line px-3 text-base font-bold text-danger disabled:opacity-50">
                            {t`削除`}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3 md:hidden">
            <label className="flex items-center gap-2 text-base font-bold">
              {t`並べかえ`}
              <select
                value={sort ? `${sort.key}:${sort.dir}` : ""}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(":");
                  setSort(key ? { key, dir: dir === "desc" ? "desc" : "asc" } : null);
                }}
                className={`${inputClass} max-w-64`}
              >
                <option value="">{t`新しい順`}</option>
                {[{ key: "name", label: t`名前` }, ...columns.map((f) => ({ key: f.name, label: pick(f.label, locale) }))].flatMap((c) => [
                  <option key={`${c.key}:asc`} value={`${c.key}:asc`}>{`${c.label} ↑`}</option>,
                  <option key={`${c.key}:desc`} value={`${c.key}:desc`}>{`${c.label} ↓`}</option>,
                ])}
              </select>
            </label>
            {canDelete ? (
              <label className="tap-target flex items-center gap-2 text-base font-bold">
                <input type="checkbox" checked={allTicked} onChange={tickAll} className="size-5" />
                {t`このページをすべて選ぶ`}
              </label>
            ) : null}
          </div>
          {/* A card per row on a phone: the name, then the facts as labelled chips and lines. */}
          <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line md:hidden">
            {rows.map((item) => {
              const href = itemHref(config, item);
              return (
                <li key={item.id} className="flex items-start gap-3 p-3">
                  {canDelete ? <input type="checkbox" aria-label={t`${name(item)}を選ぶ`} checked={ticked.has(item.id)} onChange={() => toggle(item.id)} className="mt-2 size-5 shrink-0" /> : null}
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div>
                      {href ? (
                        <Link href={href} className="break-words text-xl font-bold text-accent underline underline-offset-4">
                          {name(item) || "—"}
                        </Link>
                      ) : (
                        <p className="break-words text-xl font-bold">{name(item) || "—"}</p>
                      )}
                      {nameIsFallback(config, item) ? <p className="text-base text-muted">{String(item[config.titleField] ?? "")}</p> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      {columns.map((f) => {
                        const cell = cellOf(f, item, locale, lookup);
                        if (cell.text === "") return null;
                        return cell.chip ? (
                          <Chip key={f.name} tone={cell.tone}>
                            {cell.text}
                          </Chip>
                        ) : cell.text === "—" ? null : (
                          <span key={f.name} className="text-base">
                            <span className="text-muted">{pick(f.label, locale)}: </span>
                            {cell.text}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  {canDelete ? (
                    <button type="button" disabled={busy} onClick={() => void removeRows([item.id])} className="tap-target shrink-0 rounded-full border border-line px-3 text-base font-bold text-danger disabled:opacity-50">
                      {t`削除`}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <Pager page={page} pages={pages} disabled={busy} onPage={(n) => void goTo(n)} />
    </div>
  );
}

/** The choices of a select or yes/no field, as buttons or options: its own words, a yes/no by the words the list uses. */
function filterChoices(f: FieldUi, locale: string): { value: string; text: string }[] {
  if (f.kind === "boolean") return [{ value: "true", text: f.inList?.yes ? pick(f.inList.yes, locale) : pick({ ja: "はい", en: "Yes" }, locale) }, { value: "false", text: f.inList?.no ? pick(f.inList.no, locale) : pick({ ja: "いいえ", en: "No" }, locale) }];
  return (f.options ?? []).map((o) => ({ value: o.value, text: pick(o.label, locale) }));
}
