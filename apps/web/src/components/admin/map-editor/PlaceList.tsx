"use client";

import { useState, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { pointKinds, type PointKind } from "@/lib/point-kinds";
import { useKindLabels } from "../PlacePanel";
import { TrashIcon, UndoIcon } from "@/components/admin/admin-icons";
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, ChevronUpIcon, InfoIcon, MountainIcon, PlusIcon, RouteIcon, StampIcon } from "@/components/admin/admin-icons";
import { PinIcon } from "@/components/admin/admin-icons";
import type { MapEditorProps } from "./MapEditor";

const fieldClass = "h-11 min-h-0 min-w-36 rounded-full border border-line bg-paper px-2 text-base";
const chipToggle = (on: boolean) =>
  `inline-flex h-11 min-h-0 min-w-0 items-center justify-center rounded-full border px-3 text-sm font-bold ${on ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink hover:bg-surface"}`;

/** A round button with only an icon (its words are its aria-label and tip); 48 px, like every control. */
const iconButton = (on: boolean) =>
  `inline-flex size-12 min-h-0 min-w-0 items-center justify-center rounded-full border disabled:opacity-40 ${on ? "border-ink bg-ink text-paper" : "border-line bg-paper text-ink hover:bg-surface"}`;

/** What a waypoint is, as a small icon with its word for screen readers and as a tip. */
function Badge({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <span title={text} className="inline-flex size-9 items-center justify-center rounded-full bg-surface text-ink [&_svg]:size-5">
      {icon}
      <span className="sr-only">{text}</span>
    </span>
  );
}

/** Every waypoint of the route in one list: its name, its kind and its two switches can all be changed here. */
export function PlaceList({ places, selectedKey, onSelectPlace, onRemovePlace, onPatchPlace, onAddEndAt, onReorderPlaces, insertAfter, onInsertAfter, onDrawSubCourse, locating, onLocate, picking, onPick, back }: Pick<MapEditorProps, "places" | "selectedKey" | "onSelectPlace" | "onRemovePlace" | "onPatchPlace" | "onAddEndAt" | "onReorderPlaces"> & {
  /** The place whose 遥拝 waypoint is being chosen on the map, and how to start or stop that. */
  picking: string | null;
  onPick: (key: string) => void;
  insertAfter: string | null;
  onInsertAfter: (key: string) => void;
  onDrawSubCourse: (key: string) => void;
  /** The waypoint waiting for a click on the map to get its position, and the switch for it. */
  locating: string | null;
  onLocate: (key: string) => void;
  /** The way back over earlier stops (戻る道): its legs so far (stop keys), the stops it may go back to next, and what to do. */
  back: { legs: { from: string; to: string }[]; activeIndex: number; options: string[]; onAdd: (toKey: string) => void; onRemoveLast: () => void; onDraw: (index: number) => void };
}) {
  const { t } = useLingui();
  const kindName = useKindLabels();
  const [backTo, setBackTo] = useState("");
  const nameOfKey = (key: string) => {
    const p = places.find((x) => x.key === key);
    return p ? `${p.number}. ${p.name || ""}`.trim() : "";
  };
  const stamps = places.filter((p) => p.stampable).length;
  const others = places.length - stamps;
  // The first stop of the path: a round trip ends where it began, so this is where an end point can be added.
  const firstStop = places.find((p) => !p.stopBy && p.lat !== null)?.key;
  const move = (i: number, step: -1 | 1) => {
    const keys = places.map((p) => p.key);
    const j = i + step;
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j]!, keys[i]!];
    onReorderPlaces(keys);
  };
  // The sub-course of a side trip starts at the last waypoint before it that is on the route; choosing another puts it right after that one.
  const mainBefore = (i: number) => places.slice(0, i).findLast((p) => !p.stopBy && p.lat !== null)?.key ?? "";
  const branchTo = (key: string, from: string) => {
    const keys = places.map((p) => p.key).filter((k) => k !== key);
    keys.splice(keys.indexOf(from) + 1, 0, key);
    onReorderPlaces(keys);
  };
  const mains = places.filter((p) => !p.stopBy && p.lat !== null);
  return (
    <section aria-label={t`経由地一覧`} className="flex min-w-0 flex-col gap-2">
      <h3 className="text-lg font-bold">
        {t`経由地（${places.length}か所）`}
        <span className="ml-3 text-sm font-normal text-muted">{t`スタンプ ${stamps}・その他 ${others}`}</span>
      </h3>
      {/* Under the map, full width; on a very wide screen two columns of rows. A row shows the name, what the waypoint is (as
          icons) and the buttons to move, add after, place and remove it; choosing it opens the rest of its settings. */}
      <ol className="grid items-start gap-2">
        {places.map((p, i) => {
          const open = p.key === selectedKey;
          const label = p.name || String(p.number ?? i + 1);
          return (
            <li
              key={p.key}
              onClick={() => onSelectPlace(p.key)}
              className={`flex min-w-0 flex-col gap-2 rounded-xl border bg-paper p-3 ${open ? "border-ink ring-2 ring-ink" : "border-line"}`}
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3">
                <span
                  aria-hidden="true"
                  className={`flex shrink-0 items-center justify-center rounded-full text-base font-bold ${p.stampable ? "size-9 bg-brand-strong text-on-brand-strong" : "size-7 border-2 border-ink bg-paper"} ${p.stopBy ? "border-dashed" : ""}`}
                >
                  {p.stampable ? p.number : ""}
                </span>
                <input
                  value={p.name}
                  onChange={(e) => onPatchPlace(p.key, { nameJa: e.target.value })}
                  onFocus={() => onSelectPlace(p.key)}
                  aria-label={t`名称`}
                  placeholder={t`（名称を入力）`}
                  maxLength={200}
                  className={`${fieldClass} w-full text-lg font-bold`}
                />
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t`${label}を前へ`} title={t`順番を前へ`} className={iconButton(false)}>
                    <ArrowUpIcon size={22} />
                  </button>
                  <button type="button" disabled={i === places.length - 1} onClick={() => move(i, 1)} aria-label={t`${label}を後ろへ`} title={t`順番を後ろへ`} className={iconButton(false)}>
                    <ArrowDownIcon size={22} />
                  </button>
                  <button type="button" aria-pressed={insertAfter === p.key} onClick={() => onInsertAfter(p.key)} aria-label={t`${label}の次に経由地を追加`} title={t`地図をクリックして、この経由地の次に新しい経由地を追加します`} className={iconButton(insertAfter === p.key)}>
                    <PlusIcon />
                  </button>
                  {p.lat === null ? (
                    <button type="button" aria-pressed={locating === p.key} onClick={() => onLocate(p.key)} aria-label={t`${label}の位置を地図で設定`} title={locating === p.key ? t`地図をクリックして位置を設定してください（もう一度押すとキャンセル）` : t`地図で位置を設定`} className={iconButton(locating === p.key)}>
                      <PinIcon />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onRemovePlace(p.key)}
                    aria-label={t`${label}を削除`}
                    aria-disabled={p.published}
                    title={p.published ? t`公開中の経由地は削除できません。先に「経由地」タブで非公開にしてください` : t`削除`}
                    className={`${iconButton(false)} ${p.published ? "cursor-not-allowed text-muted opacity-60" : "text-danger"}`}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>

              {/* What the waypoint is, at a glance: icons with their words for screen readers and as a tip. */}
              <div className="flex flex-wrap items-center gap-2 pl-12">
                {p.stampable ? <Badge icon={<StampIcon />} text={t`スタンプ`} /> : null}
                {p.stopBy && !p.detached ? <Badge icon={<RouteIcon />} text={t`寄り道`} /> : null}
                {p.detached ? <Badge icon={<MountainIcon />} text={t`ルート外`} /> : null}
                {p.info ? <Badge icon={<InfoIcon />} text={t`案内のみ`} /> : null}
                {p.published ? (
                  <span title={t`公開中の経由地は削除できません。編集すると下書きに戻ります。`} className="rounded-full bg-moss px-2.5 py-0.5 text-sm font-bold text-paper">
                    {t`公開中`}
                  </span>
                ) : null}
                {p.lat === null ? <span className="text-sm font-bold text-danger">{locating === p.key ? t`地図をクリックしてください` : t`位置未設定`}</span> : null}
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPlace(open ? null : p.key);
                  }}
                  className="tap-target ml-auto inline-flex items-center gap-1 rounded-full px-3 text-base font-bold underline underline-offset-4"
                >
                  {open ? t`閉じる` : t`設定`}
                  <span aria-hidden="true">{open ? <ChevronUpIcon /> : <ChevronDownIcon />}</span>
                </button>
              </div>

              {open ? (
                <div className="flex flex-col gap-3 rounded-lg bg-surface p-3" onClick={(e) => e.stopPropagation()}>
                  <label className="flex flex-col gap-1 text-base font-bold">
                    {t`種類`}
                    <select value={p.kind} onChange={(e) => onPatchPlace(p.key, { kind: e.target.value as PointKind })} className={`${fieldClass} w-full max-w-xs`}>
                      {pointKinds.map((k) => (
                        <option key={k} value={k}>
                          {kindName[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" aria-pressed={p.stampable} onClick={() => onPatchPlace(p.key, { stampable: !p.stampable })} className={chipToggle(p.stampable)}>
                      {t`スタンプ`}
                    </button>
                    {/* 寄り道 and 道とつながらない are one choice of three (on the way / side trip / not connected): a detached place is
                        stored as a side trip, so 寄り道 lights only for a plain one, and pressing it on a detached place makes it plain. */}
                    <button type="button" aria-pressed={p.stopBy && !p.detached} onClick={() => onPatchPlace(p.key, p.stopBy && !p.detached ? { stopBy: false, detached: false } : { stopBy: true, detached: false })} className={chipToggle(p.stopBy && !p.detached)}>
                      {t`寄り道`}
                    </button>
                    <button type="button" aria-pressed={!!p.detached} onClick={() => onPatchPlace(p.key, p.detached ? { stopBy: false, detached: false, stampSpotId: null } : { stopBy: true, detached: true })} className={chipToggle(!!p.detached)} title={t`立ち入れない場所（遠くから遥拝する経塚など）。地図には表示されますが、番号やルート線は付きません。表示ラベルは「経由地」タブで変更できます。`}>
                      {t`ルート外`}
                    </button>
                    <button type="button" aria-pressed={!!p.info} onClick={() => onPatchPlace(p.key, { info: !p.info })} className={chipToggle(!!p.info)}>
                      {t`案内のみ`}
                    </button>
                  </div>
                  {p.detached ? (
                    <div className="flex flex-col gap-2">
                      <label className="flex min-w-0 flex-col gap-1 text-base font-bold">
                        {t`遥拝場所（スタンプを押す地点）`}
                        <select
                          value={p.stampFromKey ? (places.find((x) => x.key === p.stampFromKey)?.id ?? "") : ""}
                          disabled={!!p.id && places.some((x) => x.stampFromKey === p.key)}
                          onChange={(e) => onPatchPlace(p.key, { stampSpotId: e.target.value || null })}
                          className={`${fieldClass} w-full min-w-0 max-w-md`}
                        >
                          <option value="">{t`この地点で押す（設定なし）`}</option>
                          {places
                            .filter((x) => x.key !== p.key && x.id && !x.stampFromKey)
                            .map((x) => (
                              <option key={x.key} value={x.id!}>
                                {x.name || t`（名称未設定）`}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button type="button" aria-pressed={picking === p.key} onClick={() => onPick(p.key)} className={`${chipToggle(picking === p.key)} self-start`} title={t`地図上で遥拝場所となる経由地のピンをクリックしてください`}>
                        {picking === p.key ? t`地図上のピンをクリック` : t`地図から選択`}
                      </button>
                    </div>
                  ) : null}
                  {p.key === firstStop && places.length >= 2 ? (
                    <button type="button" onClick={() => onAddEndAt(p.key)} className={`${chipToggle(false)} self-start`} title={t`周回コースの場合、同じ位置にスタンプなしの終点を追加します。`}>
                      {t`同じ場所に終点を追加`}
                    </button>
                  ) : null}
                  {p.stopBy && !p.detached && mains.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <label className="flex min-w-0 flex-col gap-1 text-base font-bold">
                        {t`サブコースの分岐点`}
                        <select value={mainBefore(i)} onChange={(e) => branchTo(p.key, e.target.value)} className={`${fieldClass} w-full min-w-0 max-w-md`}>
                          <option value="" disabled>
                            {t`選択してください`}
                          </option>
                          {mains.map((m) => (
                            <option key={m.key} value={m.key}>
                              {m.name || t`（名称未設定）`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="button" onClick={() => onDrawSubCourse(p.key)} className={`${chipToggle(false)} self-start`} title={t`分岐点からこの寄り道までのルート線を描画します（本線は維持されます）`}>
                        {t`サブコースを描画`}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
        {/* The way back (戻る道) goes on in the same list, a row per return leg, after the last waypoint: the stop it returns to,
            in the order walked (14 → 5 → 4 → 1). Choosing a row picks its line on the map, as choosing a waypoint does. */}
        {back.legs.map((l, i) => {
          const open = i === back.activeIndex;
          const to = nameOfKey(l.to);
          return (
            <li
              key={`back-${l.from}>${l.to}`}
              onClick={() => back.onDraw(i)}
              className={`flex min-w-0 flex-col gap-1 rounded-xl border bg-paper p-3 ${open ? "border-ink ring-2 ring-ink" : "border-line"}`}
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3">
                <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-ink bg-paper">
                  <UndoIcon />
                </span>
                <p className="min-w-0 text-lg font-bold">
                  {t`戻る：${to}`}
                  <span className="block text-base font-normal text-muted">{t`${nameOfKey(l.from)} から来た道を戻ります`}</span>
                </p>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => back.onDraw(i)} className={chipToggle(open)}>
                    {t`ルートを描画`}
                  </button>
                  {i === back.legs.length - 1 ? (
                    <button type="button" onClick={back.onRemoveLast} aria-label={t`末尾の戻りルートを削除`} title={t`末尾の戻りルートを削除`} className={`${iconButton(false)} text-danger`}>
                      <TrashIcon />
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
        {back.options.length > 0 ? (
          <li className="flex min-w-0 flex-col gap-2 rounded-xl border-2 border-dashed border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label={t`戻る先`} value={backTo} onChange={(e) => setBackTo(e.target.value)} className={fieldClass}>
                <option value="">{t`戻る先を選択`}</option>
                {back.options.map((key) => (
                  <option key={key} value={key}>
                    {nameOfKey(key)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={backTo === ""}
                onClick={() => {
                  back.onAdd(backTo);
                  setBackTo("");
                }}
                className={chipToggle(backTo !== "")}
              >
                <UndoIcon /> {t`戻りルートを追加`}
              </button>
            </div>
          </li>
        ) : null}
      </ol>
    </section>
  );
}
