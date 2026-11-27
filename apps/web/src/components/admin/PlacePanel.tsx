"use client";

import { useRef, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { usePointKindNames } from "@/components/PointKindName";
import { publishBlockers, type PlaceDraft, type PublishBlocker } from "@/lib/admin/route-draft";
import type { SpotStatus } from "@/lib/admin/types";
import { RubyEditor } from "./RubyEditor";
import { Check, Field, inputClass, MultilingualField, NumberInput, TextInput } from "./fields";
import { PhotoListEditor } from "./PhotoListEditor";
import { PhotoSlot } from "./PhotoSlot";
import { WaypointTypeFields } from "./WaypointTypeFields";
import { PhotoUpload } from "./PhotoUpload";

export interface PlacePanelProps {
  place: PlaceDraft;
  number: number;
  selected: boolean;
  /** True when this place has changes that are not saved yet. */
  dirty: boolean;
  busy: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  invalidName: boolean;
  invalidPhoto: boolean;
  /** Opens and closes the form; without it the form is always open and the name is a plain heading. */
  onSelect?: () => void;
  onChange: (patch: Partial<PlaceDraft>) => void;
  onRemove: () => void;
  onMove: (step: -1 | 1) => void;
  /** The route must be saved once before a waypoint can be saved on its own. */
  canSave: boolean;
  onSave: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  /** A map to place it on, under the numbers (the route editor has its own map tab). */
  positionMap?: ReactNode;
  /** Waypoints it may be worshipped from (遥拝), see stampFromChoices. */
  stampFrom: { choices: { id: string; name: string }[]; isHub: boolean; here: string[] };
}

/**
 * One place on the route. The short form (name, text, photo, position, kind) is what most edits need; the stamp
 * settings (range, status, permission) are folded away. What still stops it being published is always visible.
 */
/** A block of the place form, set off by a rule above it (and a heading, when it has none of its own). */
function Group({ title, first = false, children }: { title?: string; first?: boolean; children: ReactNode }) {
  return (
    // A fieldset, so the title sits on its line (the same as every other group).
    <fieldset className={`flex min-w-0 flex-col gap-5 ${first ? "" : "border-t-2 border-line pt-3"}`}>
      {title ? <legend className="pr-3 text-xl font-bold">{title}</legend> : null}
      {children}
    </fieldset>
  );
}

export function PlacePanel(p: PlacePanelProps) {
  const { t } = useLingui();
  const { place } = p;
  const blockers = publishBlockers(place, p.dirty);
  const kindName = usePointKindNames();
  const isStamp = place.stampable;
  const isInfo = place.status === "info";
  const blockerText: Record<PublishBlocker, string> = {
    unsaved: t`先に「経由地を保存」を押してください。`,
    no_coordinates: t`位置を設定してください（地図上で指定するか、緯度・経度を入力します）。`,
    position_not_verified: t`公式情報で位置を確認し、「位置確認済み」にチェックを入れて情報源を入力してください。`,
    permission_required: t`現地の許可を確認し、「許可確認済み」にチェックを入れてください。`,
    note_required: t`「「状況の補足」（日本語）を入力してください。「現在立ち入り禁止」など、訪問者に伝えたい内容を記載します。`,
  };
  const statusName: Record<SpotStatus, string> = { open: t`通常`, caution: t`注意`, closed: t`通行止め`, info: t`案内のみ` };
  const id = `place-${place.key}`;
  const settings = useRef<HTMLDetailsElement>(null);
  // What to tick for each reason the place cannot be published yet: the button under 公開する takes the admin there.
  const blockerField: Partial<Record<PublishBlocker, string>> = { no_coordinates: `${id}-lat`, position_not_verified: `${id}-verified`, permission_required: `${id}-permission`, note_required: `${id}-note` };
  const goTo = (fieldId: string) => {
    if ((fieldId === `${id}-permission` || fieldId === `${id}-note`) && settings.current) settings.current.open = true;
    const el = document.getElementById(fieldId);
    el?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    el?.focus({ preventScroll: true });
  };

  return (
    <li className={`rounded-2xl border-2 ${p.selected ? "border-ink" : "border-line"} bg-paper`}>
      <div className="flex flex-wrap items-center gap-3 p-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-strong text-lg font-bold text-on-brand-strong">
          {p.number}
        </span>
        {p.onSelect ? (
          <button type="button" onClick={p.onSelect} aria-expanded={p.selected} className="min-w-0 flex-1 text-left text-xl font-bold text-accent underline underline-offset-4">
            {place.nameJa || t`（名称未設定）`}
          </button>
        ) : (
          <h3 className="min-w-0 flex-1 break-words text-xl font-bold">{place.nameJa || t`（名称未設定）`}</h3>
        )}
        <span className="rounded-full bg-surface px-3 py-1 text-base">{kindName[place.kind]}</span>
        <span className={`rounded-full px-3 py-1 text-base font-bold ${place.published ? "bg-moss text-paper" : "bg-surface text-ink"}`}>{place.published ? t`公開中` : t`下書き`}</span>
        {p.dirty ? <span className="text-base font-bold text-accent">{t`未保存`}</span> : null}
        {!place.published && !p.selected && blockers.filter((b) => b !== "unsaved").length > 0 ? (
          <p className="w-full pl-[3.25rem] text-base text-muted">{t`公開まであと${blockers.filter((b) => b !== "unsaved").length}項目`}</p>
        ) : null}
      </div>

      {p.selected ? (
        <div className="flex flex-col gap-6 border-t border-line p-4">
          <Group title={t`基本情報`} first>
          <MultilingualField id={`${id}-name`} label={t`経由地名`} field="name" ja={place.nameJa} en={place.nameEn} translations={place.translations} onJa={(v) => p.onChange({ nameJa: v })} onEn={(v) => p.onChange({ nameEn: v })} onTranslations={(v) => p.onChange({ translations: v })} required invalid={p.invalidName} />
          <Field label={t`ふりがな（読み）`} >
            <RubyEditor name={place.nameJa} value={place.nameKana} onChange={(v) => p.onChange({ nameKana: v })} />
          </Field>
          <MultilingualField id={`${id}-desc`} label={t`説明`} field="description" ja={place.descriptionJa} en={place.descriptionEn} translations={place.translations} onJa={(v) => p.onChange({ descriptionJa: v })} onEn={(v) => p.onChange({ descriptionEn: v })} onTranslations={(v) => p.onChange({ translations: v })} long="short" />
          <MultilingualField id={`${id}-history`} label={t`歴史・由来`} field="history" ja={place.historyJa} en={place.historyEn} translations={place.translations} onJa={(v) => p.onChange({ historyJa: v })} onEn={(v) => p.onChange({ historyEn: v })} onTranslations={(v) => p.onChange({ translations: v })} long="short" />
          <MultilingualField id={`${id}-source`} label={t`出典`} field="source" ja={place.sourceJa} en={place.sourceEn} translations={place.translations} onJa={(v) => p.onChange({ sourceJa: v })} onEn={(v) => p.onChange({ sourceEn: v })} onTranslations={(v) => p.onChange({ translations: v })} long="short" />

          </Group>

          <Group title={t`種類とスタンプ`}>
          <WaypointTypeFields place={place} onChange={p.onChange} stampFrom={p.stampFrom} />

          {isInfo ? null : isStamp || place.stampImageUrl ? (
            <div className="flex flex-col gap-2">
              <p className="text-base font-bold">{t`専用スタンプ画像`}</p>
              <p className="text-base text-muted">{t`設定すると、標準の赤いスタンプの代わりにこの画像が表示されます。正方形・背景透過の画像を推奨します。`}</p>
              <PhotoUpload onUploaded={(url) => p.onChange({ stampImageUrl: url })} />
              <PhotoSlot url={place.stampImageUrl} className="max-w-32" />
              {place.stampImageUrl ? (
                <button type="button" className="self-start text-base font-bold text-accent underline" onClick={() => p.onChange({ stampImageUrl: "" })}>
                  {t`削除`}
                </button>
              ) : null}
            </div>
          ) : null}
          </Group>

          <Group title={t`写真`}>
            <PhotoListEditor
              stored={{ photoUrl: place.photoUrl, photoCredit: place.photoCredit, photoSourceUrl: place.photoSourceUrl, photoNameJa: place.photoNameJa, photoNameEn: place.photoNameEn, photos: place.photos }}
              onChange={(next) => p.onChange(next)}
              name={place.nameJa}
              lat={place.lat}
              lng={place.lng}
            />
            {p.invalidPhoto ? <p role="alert" className="text-base font-bold text-danger">{t`写真URLは https:// で始まる形式で入力してください。`}</p> : null}
          </Group>

          {/* 2026-11-26, user: the visitor's fly-along over the 3D course map stops at waypoints and shows a card; how, per waypoint. */}
          <Group title={t`3D再生の設定`}>
            <Field
              label={t`一時停止の設定`}
              htmlFor={`${id}-fly-show`}
              hint={t`3Dマップでルートを再生した際、この地点で一時停止して紹介カードを表示するかどうかを設定します。「自動」ではスタンプスポットと寄り道で停止します。`}
            >
              <select
                id={`${id}-fly-show`}
                value={place.flyShow === null ? "" : place.flyShow ? "yes" : "no"}
                onChange={(e) => p.onChange({ flyShow: e.target.value === "" ? null : e.target.value === "yes" })}
                className={`${inputClass} max-w-md`}
              >
                <option value="">{t`自動`}</option>
                <option value="yes">{t`停止する`}</option>
                <option value="no">{t`通過する`}</option>
              </select>
            </Field>
            <Field label={t`停止時間（秒）`} htmlFor={`${id}-fly-seconds`}>
              <div className="flex items-center gap-3">
                <input
                  id={`${id}-fly-seconds`}
                  type="range"
                  min={3}
                  max={15}
                  step={1}
                  value={place.flySeconds ?? 5}
                  onChange={(e) => p.onChange({ flySeconds: Number(e.target.value) })}
                  className="h-10 w-full max-w-sm accent-[var(--color-brand)]"
                />
                <span className="w-20 text-lg font-bold tabular-nums">{place.flySeconds ?? 5} s</span>
              </div>
            </Field>
            <Field label={t`表示する写真`} htmlFor={`${id}-fly-photo`}>
              <select
                id={`${id}-fly-photo`}
                value={place.flyPhotoUrl}
                onChange={(e) => p.onChange({ flyPhotoUrl: e.target.value })}
                className={`${inputClass} max-w-md`}
              >
                <option value="">{t`メインの写真`}</option>
                {place.photos
                  .filter((x) => x.url.trim() !== "" && x.url !== place.photoUrl)
                  .map((x, i) => (
                    <option key={x.url} value={x.url}>
                      {x.nameJa?.trim() || t`写真 ${i + 2}`}
                    </option>
                  ))}
              </select>
            </Field>
            <PhotoSlot url={place.flyPhotoUrl || place.photoUrl} className="max-w-48" />
            <MultilingualField
              id={`${id}-fly-note`}
              label={t`紹介コメント`}
              field="flyNote"
              ja={place.flyNoteJa}
              en={place.flyNoteEn}
              translations={place.translations}
              onJa={(v) => p.onChange({ flyNoteJa: v })}
              onEn={(v) => p.onChange({ flyNoteEn: v })}
              onTranslations={(v) => p.onChange({ translations: v })}
            />
          </Group>

          <Group title={t`位置`}>
            <div className="flex flex-wrap gap-4">
              <Field label={t`緯度`} htmlFor={`${id}-lat`}>
                <NumberInput id={`${id}-lat`} value={place.lat} min={-90} max={90} onChange={(v) => p.onChange({ lat: v })} />
              </Field>
              <Field label={t`経度`} htmlFor={`${id}-lng`}>
                <NumberInput id={`${id}-lng`} value={place.lng} min={-180} max={180} onChange={(v) => p.onChange({ lng: v })} />
              </Field>
            </div>
            <p className="text-base text-muted">{t`位置情報は公式データをもとに設定し、地図上で確認してください（推測での入力は不可）。`}</p>
            {p.positionMap}
            <Check id={`${id}-verified`} checked={place.positionVerified} disabled={place.lat === null} onChange={(v) => p.onChange({ positionVerified: v })}>
              {t`位置確認済み`}
            </Check>
            <Field label={t`確認元の情報源（サイト名・URLなど）`} htmlFor={`${id}-source`}>
              <TextInput id={`${id}-source`} value={place.positionSource} onChange={(v) => p.onChange({ positionSource: v })} maxLength={500} />
            </Field>
          </Group>

          {/* Open at first, so the permission tick is in view; it can be folded away. */}
          <details ref={settings} open className="rounded-xl bg-surface p-4">
            <summary className="tap-target flex cursor-pointer flex-wrap items-center gap-x-3 text-lg font-bold">
              {isStamp ? t`スタンプ・状態・許可の設定` : t`状態・許可の設定`}
              {place.permissionConfirmed ? null : <span className="rounded-full border-2 border-danger px-2 text-base text-danger">{t`許可未確認`}</span>}
            </summary>
            <div className="mt-3 flex flex-col gap-5">
              {isStamp && !isInfo ? (
                <Field label={t`スタンプ獲得範囲（m）`} htmlFor={`${id}-radius`} hint={t`この経由地から指定した半径内にいる場合、スタンプを獲得できます。`}>
                  <div className="flex items-center gap-3">
                    <input id={`${id}-radius`} type="range" min={10} max={1000} step={5} value={place.radiusM} onChange={(e) => p.onChange({ radiusM: Number(e.target.value) })} className="h-10 w-full max-w-sm accent-[var(--color-brand)]" />
                    <span className="w-20 text-lg font-bold tabular-nums">{place.radiusM} m</span>
                  </div>
                </Field>
              ) : null}

              <fieldset className="flex flex-col gap-3">
                <legend className="text-base font-bold">{t`いまの状態`}</legend>
                <select aria-label={t`現在の状況`} value={place.status} onChange={(e) => p.onChange({ status: e.target.value as SpotStatus })} className={`${inputClass} max-w-xs`}>
                  <option value="open">{statusName.open}</option>
                  <option value="caution">{statusName.caution}</option>
                  <option value="closed">{statusName.closed}</option>
                  <option value="info">{statusName.info}</option>
                </select>
                <MultilingualField id={`${id}-note`} label={t`状況の補足`} field="statusNote" ja={place.statusNoteJa} en={place.statusNoteEn} translations={place.translations} onJa={(v) => p.onChange({ statusNoteJa: v })} onEn={(v) => p.onChange({ statusNoteEn: v })} onTranslations={(v) => p.onChange({ translations: v })} />
              </fieldset>

              <fieldset className="flex flex-col gap-3">
                <legend className="text-base font-bold">{t`現地の許可`}</legend>
                <Check id={`${id}-permission`} checked={place.permissionConfirmed} onChange={(v) => p.onChange({ permissionConfirmed: v })}>
                  {t`許可確認済み`}
                </Check>
                <Field label={t`許可元・担当者`} htmlFor={`${id}-permnote`}>
                  <TextInput id={`${id}-permnote`} value={place.permissionNote} onChange={(v) => p.onChange({ permissionNote: v })} maxLength={500} />
                </Field>
              </fieldset>
            </div>
          </details>

          <div className="flex flex-col gap-3 rounded-xl bg-surface p-4">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={p.busy || !p.dirty || !p.canSave} onClick={p.onSave} className="tap-target w-fit rounded-full bg-ink px-6 text-lg font-bold text-paper disabled:opacity-40">
                {t`経由地を保存`}
              </button>
              {!p.canSave ? <p className="text-base text-muted">{t`先にコースを保存してください。`}</p> : place.published && p.dirty ? <p className="text-base text-muted">{t`保存するとこの経由地は下書きに戻ります。`}</p> : null}
            </div>
            {place.published ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-lg font-bold">{t`この経由地は公開されています。`}</p>
                <button type="button" disabled={p.busy} onClick={p.onUnpublish} className="tap-target rounded-full border border-line px-5 text-lg font-bold disabled:opacity-40">
                  {t`非公開にする`}
                </button>
              </div>
            ) : (
              <>
                <button type="button" disabled={p.busy || blockers.length > 0} onClick={p.onPublish} className="tap-target w-fit rounded-full bg-ink px-6 text-lg font-bold text-paper disabled:opacity-40">
                  {t`公開する`}
                </button>
                {blockers.length > 0 ? (
                  <ul className="list-disc pl-6 text-base text-muted">
                    {blockers.map((b) => {
                      const target = blockerField[b];
                      return (
                        <li key={b}>
                          {target ? (
                            <button type="button" onClick={() => goTo(target)} className="tap-target text-left font-bold text-accent underline underline-offset-4">
                              {blockerText[b]}
                            </button>
                          ) : (
                            blockerText[b]
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {p.canMoveUp || p.canMoveDown ? (
              <>
                <button type="button" disabled={!p.canMoveUp} onClick={() => p.onMove(-1)} className="tap-target rounded-full border border-line px-4 text-base font-bold disabled:opacity-40">
                  {t`順番を前へ`}
                </button>
                <button type="button" disabled={!p.canMoveDown} onClick={() => p.onMove(1)} className="tap-target rounded-full border border-line px-4 text-base font-bold disabled:opacity-40">
                  {t`順番を後ろへ`}
                </button>
              </>
            ) : null}
            <button type="button" disabled={place.published} onClick={p.onRemove} className="tap-target ml-auto rounded-full border-2 border-danger px-4 text-base font-bold text-danger disabled:opacity-40">
              {t`この経由地を削除`}
            </button>
          </div>
          {place.published ? <p className="text-base text-muted">{t`公開中の経由地を削除するには、先に「非公開にする」を押してください。`}</p> : null}
        </div>
      ) : null}
    </li>
  );
}
