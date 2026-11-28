"use client";

import { useLingui } from "@lingui/react/macro";
import { confirmDialog } from "@/components/ConfirmDialog";
import { useErrorMessages } from "@/components/useErrorMessages";
import { api } from "@/lib/api";
import { outcome } from "@/lib/admin/admin-client";
import { editorPlacesOf } from "@/lib/admin/editor-places";
import type { LngLatEle } from "@/lib/admin/line";
import { restoreOnto, writeBackup } from "@/lib/admin/draft-backup";
import { stampFromChoices, type RouteDraft } from "@/lib/admin/route-draft";
import { formatUpdated } from "@/lib/format";
import { Check, Field, TextInput } from "./fields";
import { MapEditorLoader } from "./map-editor/MapEditorLoader";
import { PublishedEditDialog } from "./PublishedEditDialog";
import { WaypointTypeFields } from "./WaypointTypeFields";
import type { useRouteDraft } from "./useRouteDraft";

/** One course's map editor and its line check, on a `useRouteDraft` draft. Shared by the course page and the one map. */
export function CourseMapEditor({ d, confirmRemoval }: { d: ReturnType<typeof useRouteDraft>; confirmRemoval: (key: string) => Promise<boolean> }) {
  const { t } = useLingui();
  const messages = useErrorMessages();
  const { state, dispatch, draft, selectedKey, setSelectedKey, guarded, heightsState } = d;
  const editorPlaces = editorPlacesOf(draft);
  const text = (field: "lineSource") => (value: string) => dispatch({ type: "text", field, value });
  return (
    <>
      <MapEditorLoader
        line={draft.line}
        legs={draft.legs}
        places={editorPlaces}
        selectedKey={selectedKey}
        distanceKm={draft.distanceKm}
        climbM={draft.elevationGainM}
        elevationStatus={heightsState}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        onUndo={() => dispatch({ type: "undo" })}
        onRedo={() => dispatch({ type: "redo" })}
        onLine={(points) => dispatch({ type: "line", points })}
        onHeights={(points) => dispatch({ type: "elevations", points })}
        onSetLeg={(leg) => dispatch({ type: "setLeg", leg })}
        onAutoLegs={(legs) => dispatch({ type: "autoLegs", legs })}
        onSetLegs={(legs) => dispatch({ type: "setLegs", legs })}
        onClearLeg={(from, to) => dispatch({ type: "clearLeg", from, to })}
        onClearLegs={() => dispatch({ type: "clearLegs" })}
        onSplitLine={() => dispatch({ type: "splitLine" })}
        onReorderPlaces={(keys) => dispatch({ type: "reorderPlaces", keys })}
        onAddPlace={(lat, lng, after) => {
          const key = crypto.randomUUID();
          dispatch({ type: "addPlace", key, lat, lng, after });
          setSelectedKey(key);
        }}
        onAddEndAt={(from) => {
          const start = draft.places.find((p) => p.key === from);
          if (!start || start.lat === null || start.lng === null) return;
          const key = crypto.randomUUID();
          const name = start.nameJa.trim() || t`出発点`;
          const nameEn = start.nameEn.trim();
          // Not a stamp place (the start already is one, and a stamp is once per place); the position and what checked it are the start's own.
          dispatch({
            type: "addPlace",
            key,
            lat: start.lat,
            lng: start.lng,
            kind: start.kind,
            patch: {
              stampable: false,
              nameJa: t`${name}（終点）`,
              nameEn: nameEn ? t`${nameEn} (end)` : "",
              positionVerified: start.positionVerified,
              positionSource: start.positionSource,
            },
          });
          setSelectedKey(key);
        }}
        onAddPlaces={(list) => dispatch({ type: "addPlaces", places: list })}
        onMovePlace={(key, lat, lng) => guarded(key, { type: "movePlace", key, lat, lng })}
        onRemovePlace={(key) => void confirmRemoval(key).then((yes) => yes && dispatch({ type: "removePlace", key }))}
        onSelectPlace={setSelectedKey}
        area={{ value: draft.area, onChange: (value) => dispatch({ type: "area", value }) }}
        onPatchPlace={(key, patch) => guarded(key, { type: "place", key, patch })}
        placeSettings={(key, pickOnMap) => {
          const p = draft.places.find((x) => x.key === key);
          return p ? <WaypointTypeFields place={p} onChange={(patch) => guarded(key, { type: "place", key, patch })} stampFrom={stampFromChoices(draft.places, key)} pickOnMap={pickOnMap} /> : null;
        }}
        onSnap={async (points) => {
          const res = await outcome(api.admin["route-snap"].post({ points }));
          return res.ok ? { ok: true, line: res.data.line as LngLatEle[] } : { ok: false, message: messages[res.key] };
        }}
      />

      <fieldset className="flex flex-col gap-3 rounded-xl bg-paper p-4">
        <legend className="px-1 text-base font-bold">{t`線の確認`}</legend>
        <p className="text-base text-muted">{t`確認していない線は、利用者には表示されません。公式の地図などと見比べてから、チェックを入れてください。`}</p>
        <Check id="route-line-verified" checked={draft.lineVerified} disabled={draft.line.length < 2} onChange={(v) => dispatch({ type: "lineVerified", value: v })} required>
          {t`線を確認した`}
        </Check>
        <Field label={t`確認した情報源（サイト名やリンク）`} htmlFor="route-line-source" required>
          <TextInput id="route-line-source" value={draft.lineSource} onChange={text("lineSource")} maxLength={500} invalid={draft.lineVerified && draft.lineSource.trim() === ""} />
        </Field>
        {draft.lineVerified && draft.lineSource.trim() === "" ? <p role="alert" className="text-base font-bold text-danger">{t`情報源を入れないと、「確認した」は保存されません。`}</p> : null}
      </fieldset>
    </>
  );
}

/** Offers back the unsaved edits this browser kept for the course. Must be shown: the hook writes no new copy while the offer is open. */
export function RestoreOffer({ d, initial, locale }: { d: ReturnType<typeof useRouteDraft>; initial: RouteDraft; locale: string }) {
  const { t } = useLingui();
  const { offerOpen, offered, dispatch, setOfferClosed, setMessage } = d;
  if (!offerOpen || !offered) return null;
  const offeredAt = formatUpdated(locale, offered.at);
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-caution bg-surface p-4">
      <p className="min-w-0 flex-1 text-lg font-bold">{t`保存していない編集が、このブラウザに残っています（${offeredAt}）。戻しますか？`}</p>
      <button
        type="button"
        onClick={() => {
          dispatch({ type: "loaded", draft: restoreOnto(offered, initial) });
          setOfferClosed(true);
          setMessage({ kind: "ok", text: t`編集を戻しました。内容を確かめて、「保存する」を押してください。` });
        }}
        className="tap-target rounded-full bg-ink px-5 text-lg font-bold text-paper"
      >
        {t`編集を戻す`}
      </button>
      <button
        type="button"
        onClick={() => {
          writeBackup(localStorage, initial, initial.updatedAt, false);
          setOfferClosed(true);
        }}
        className="tap-target rounded-full border border-line px-5 text-lg font-bold"
      >
        {t`捨てる`}
      </button>
    </div>
  );
}

// ---- the frame around a course being edited: the course page (RouteEditor) and the one map (OneMapCourseEditor) share it ----

/** Asks before removing a waypoint that other courses hold too (removing it takes it off them as well). */
export function useConfirmRemoval(
  draft: RouteDraft,
  sharedWith: Record<string, string[]>,
  routeNames: Record<string, string>,
  locale: string,
  /** Where the editor shows its message: a published waypoint is refused here, for every remove button (map, panel, table). */
  setMessage: (m: { kind: "error"; text: string }) => void,
) {
  const { t } = useLingui();
  return async (key: string) => {
    const p = draft.places.find((x) => x.key === key);
    if (p?.published) {
      setMessage({ kind: "error", text: t`公開中の経由地は消せません。先に「公開をやめる」を押してください。` });
      return false;
    }
    const others = p?.id ? sharedWith[p.id] : undefined;
    if (!p || !others) return true;
    const name = locale === "en" && p.nameEn ? p.nameEn : p.nameJa;
    const where = others.map((r) => routeNames[r]).filter(Boolean).join(", ");
    return confirmDialog({ title: t`経由地を消しますか？`, body: t`「${name}」は、ほかのコース（${where}）にも置いてあります。消すと、そこからも消えます。よろしいですか？`, yes: t`消す` });
  };
}

/** Unsaved changes, or when it was last saved (nothing yet for a course never saved). */
export function SaveState({ d, locale, isNew = false }: { d: ReturnType<typeof useRouteDraft>; locale: string; isNew?: boolean }) {
  const { t } = useLingui();
  return <>{d.dirty ? t`保存していない変更があります` : isNew ? "" : t`保存済み（更新 ${formatUpdated(locale, d.draft.updatedAt ?? new Date().toISOString())}）`}</>;
}

/** The course's one save button. */
export function SaveButton({ d }: { d: ReturnType<typeof useRouteDraft> }) {
  const { t } = useLingui();
  return (
    <button type="button" disabled={!d.dirty || d.saving || d.busyKey !== null} onClick={d.save} className="tap-target rounded-full bg-ink px-8 text-xl font-bold text-paper disabled:opacity-40">
      {d.saving ? t`保存中…` : t`保存する`}
    </button>
  );
}

/** Editing a published waypoint turns it back into a draft: the question asked first (useRouteDraft's `guarded`). */
export function PublishedEditGuard({ d }: { d: ReturnType<typeof useRouteDraft> }) {
  const { t } = useLingui();
  const { pendingEdit, setPendingEdit, dispatch, draft } = d;
  return (
    <PublishedEditDialog
      name={pendingEdit ? draft.places.find((p) => p.key === pendingEdit.key)?.nameJa || t`名前のない経由地` : null}
      onProceed={() => {
        if (pendingEdit) dispatch(pendingEdit.action);
        setPendingEdit(null);
      }}
      onCancel={() => setPendingEdit(null)}
    />
  );
}
