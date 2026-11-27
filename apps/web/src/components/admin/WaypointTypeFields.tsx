"use client";

import { useId, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { pointKinds, stampableByDefault, type PointKind } from "@/lib/point-kinds";
import { usePointKindNames } from "@/components/PointKindName";
import { infoPatch, type PlaceDraft } from "@/lib/admin/route-draft";
import { Check, Field, inputClass, TextInput } from "./fields";
import { InfoTip } from "./InfoTip";

/**
 * A waypoint's 種類 and its switches: スタンプ, 寄り道, ルート外 (with the 遥拝 place and its label) and 案内のみ.
 * The only copy: the 経由地 tab (PlacePanel) and the map editor's list both show this, so a word changed here changes on both.
 */
export function WaypointTypeFields({ place, onChange, stampFrom, pickOnMap }: {
  place: PlaceDraft;
  onChange: (patch: Partial<PlaceDraft>) => void;
  /** Waypoints it may be worshipped from (遥拝), see stampFromChoices. */
  stampFrom: { choices: { id: string; name: string }[]; isHub: boolean; here: string[] };
  /** The map editor's "choose the 遥拝 place on the map" button, shown under the list of them. */
  pickOnMap?: ReactNode;
}) {
  const { t } = useLingui();
  const kindName = usePointKindNames();
  const id = useId();
  const isStamp = place.stampable;
  // The waypoint its stamp is pressed at: 遥拝場所 for a place off the trail, 閉鎖時のスタンプ地点 for any other.
  const stampSelect = (selectId: string) => (
    <select id={selectId} value={place.stampSpotId ?? ""} disabled={stampFrom.isHub} onChange={(e) => onChange({ stampSpotId: e.target.value || null })} className={`${inputClass} max-w-md`}>
      <option value="">{t`この地点で押す（指定なし）`}</option>
      {stampFrom.choices.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name || t`（名称未設定）`}
        </option>
      ))}
    </select>
  );
  return (
    <>
      <Field label={t`種類`} htmlFor={`${id}-kind`}>
        <select
          id={`${id}-kind`}
          value={place.kind}
          // A new waypoint's switch follows the kind; a saved one keeps what was chosen for it.
          onChange={(e) => {
            const kind = e.target.value as PointKind;
            onChange(place.id === null ? { kind, stampable: stampableByDefault(kind) } : { kind });
          }}
          className={`${inputClass} max-w-xs`}
        >
          {pointKinds.map((k) => (
            <option key={k} value={k}>
              {kindName[k]}
            </option>
          ))}
        </select>
      </Field>

      <InfoTip
        indent
        label={
          <Check id={`${id}-stampable`} checked={place.stampable} onChange={(v) => onChange({ stampable: v })}>
            {t`スタンプ対象`}
          </Check>
        }
        hint={isStamp ? t`現地に到着した利用者がスタンプを獲得できます。公開には現地の許可確認が必要です。` : t`スタンプ対象外となります（詳細ページは表示されます）。公開には現地の許可確認が必要です。`}
      />
      {/* 2026-11-27, user: when a path is lost (a landslide), the stamp moves to a waypoint chosen here while the place is
          closed. A 遥拝 place sets its waypoint below instead. No hint (user: too many hints already). */}
      {isStamp && !place.detached ? (
        <Field label={t`閉鎖時のスタンプ地点`} htmlFor={`${id}-closed-from`}>
          {stampSelect(`${id}-closed-from`)}
        </Field>
      ) : null}
      {/* Others are stamped here. The wording is the user's to write (2026-11-27): placeholder until then. */}
      {stampFrom.here.length ? <p className="text-base">{t`［文言未定：この経由地で押せる他のスタンプ］${stampFrom.here.join("、")}`}</p> : null}

      <InfoTip
        indent
        label={
          <Check id={`${id}-stopby`} checked={place.stopBy && !place.detached} onChange={(v) => onChange(v ? { stopBy: true, detached: false } : { stopBy: false, detached: false })}>
            {t`寄り道（ルートから少し外れた任意の立ち寄り先）`}
          </Check>
        }
        hint={t`チェックを入れると、自動ルート生成の対象から外れます。代わりに、直前の経由地からこの地点までの寄り道ルート（青い点線）を地図上で描画できます。分岐点となる経由地の直後に配置してください。`}
      />

      {/* 2026-11-17, user: a place nobody can walk to (a mound worshipped from afar) is not a side trip. Stored as a side trip
          that is also detached, so it is left out of the walk the same way, but no path is drawn to it. */}
      <InfoTip
        indent
        label={
          <Check id={`${id}-detached`} checked={place.detached} onChange={(v) => onChange(v ? { stopBy: true, detached: true } : { stopBy: false, detached: false, stampSpotId: null })}>
            {t`ルート外`}
          </Check>
        }
        hint={t`地図には表示されますが、番号やルート線は付かず、総距離・歩行時間にも含まれません。下の表示ラベルが「寄り道」の代わりに表示されます。`}
      />
      {place.detached ? (
        <div className="flex flex-col gap-3">
          {/* 2026-11-20, user: 第1経塚 is stamped from 第4砲台, 第22経塚 from 水分神社. Chosen from the course's waypoints, never
              typed: the stamp is checked at that waypoint's own checked position, and one press there gives both stamps. */}
          <Field label={t`遥拝場所`} htmlFor={`${id}-stamp-from`} hint={stampFrom.isHub ? t`他の経由地の遥拝場所に設定されているため、指定できません。` : t`指定した経由地でスタンプを押すと、この地点のスタンプも同時に獲得できます（地図上のピン位置は変わりません）。保存済みの経由地から選択できます。`}>
            {stampSelect(`${id}-stamp-from`)}
          </Field>
          {stampFrom.isHub ? null : pickOnMap}
          <Field label={t`表示ラベル（日本語）`} htmlFor={`${id}-detached-ja`} hint={t`未入力の場合、遥拝場所が設定されていれば「〇〇から遥拝」、未設定なら「ルートから離れた場所」と表示されます。`}>
            <TextInput id={`${id}-detached-ja`} value={place.detachedLabelJa} onChange={(v) => onChange({ detachedLabelJa: v })} maxLength={100} placeholder={t`省略可`} />
          </Field>
          <Field label={t`表示ラベル（英語・任意）`} htmlFor={`${id}-detached-en`}>
            <TextInput id={`${id}-detached-en`} lang="en" value={place.detachedLabelEn} onChange={(v) => onChange({ detachedLabelEn: v })} maxLength={100} placeholder="Can stay empty" />
          </Field>
        </div>
      ) : null}

      <InfoTip
        indent
        label={
          <Check id={`${id}-info`} checked={place.status === "info"} onChange={(v) => onChange(infoPatch(v, place))}>
            {t`案内のみ（スタンプなし）`}
          </Check>
        }
        hint={t`表示専用の地点です（立ち入り禁止の場所などに使用）。スタンプ対象外となり、コースやラリーのスポット数にも含まれません。「状況の補足」に「現在立ち入り禁止」などを記載してください。公開に現地の許可確認は不要です。`}
      />
    </>
  );
}
