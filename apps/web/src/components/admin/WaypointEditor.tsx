"use client";

import { useRouter } from "next/navigation";
import { useReducer, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { confirmDialog } from "@/components/ConfirmDialog";
import { useErrorMessages } from "@/components/useErrorMessages";
import { api } from "@/lib/api";
import { outcome } from "@/lib/admin/admin-client";
import { draftReducer, initialState, type DraftAction, type PlaceDraft, type RouteDraft, stampFromChoices } from "@/lib/admin/route-draft";
import { draftProblems, lineNoLongerChecked, placeChanged, type DraftProblem } from "@/lib/admin/save-plan";
import { showToast } from "@/lib/admin/toast";
import { PlacePanel } from "./PlacePanel";
import { PositionMap } from "./PositionMap";
import { PublishedEditDialog, skipsPublishedWarning } from "./PublishedEditDialog";
import { useUnsavedGuard } from "./useUnsavedGuard";
import { usePlaceSave } from "./usePlaceSave";

/**
 * One waypoint by itself, opened from 経由地の一覧. It runs on the route editor's own draft and save plan, so every rule stays
 * in one place: editing a published waypoint asks first, and it goes back to a draft when saved.
 */
export function WaypointEditor({ initial, placeId, deleteWarning }: { initial: RouteDraft; placeId: string; deleteWarning: string }) {
  const { t } = useLingui();
  const messages = useErrorMessages();
  const placeSave = usePlaceSave();
  const router = useRouter();
  const [state, dispatch] = useReducer(draftReducer, initial, initialState);
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<DraftAction | null>(null);
  const [problems, setProblems] = useState<DraftProblem[]>([]);

  const key = initial.places.find((p) => p.id === placeId)!.key;
  const number = initial.places.findIndex((p) => p.key === key) + 1;
  const place = state.present.places.find((p) => p.key === key)!;
  const dirty = placeChanged(place, saved.places.find((p) => p.key === key));
  useUnsavedGuard(dirty);

  const edit = (action: DraftAction) => (place.published && !skipsPublishedWarning() ? setPending(action) : dispatch(action));
  const keep = (next: PlaceDraft) => {
    dispatch({ type: "savedPlace", key, place: next });
    setSaved((s) => ({ ...s, places: s.places.map((p) => (p.key === key ? next : p)) }));
  };

  async function save() {
    if (busy) return;
    const found = draftProblems({ ...saved, places: [place] }).filter((p) => "key" in p && p.key === key);
    setProblems(found);
    if (found.length > 0) return showToast({ kind: "error", text: t`保存できません。赤く示した項目を直してください。` });
    setBusy(true);
    showToast(null);
    const before = saved.places.find((p) => p.key === key)!;
    const { current, failed, toast } = await placeSave.savePlace({ ...saved, places: saved.places.map((p) => (p.key === key ? place : p)) }, saved, key);
    // Whatever reached the server before a failure is kept, so the next try has fresh times; what was typed stays on a failure.
    if (failed) setSaved((s) => ({ ...s, places: s.places.map((p) => (p.key === key ? (current ?? before) : p)) }));
    else keep(current ?? before);
    // The checked course line still ends where the stop was: it is not the line a person checked any more.
    if (!failed && current && saved.id && saved.updatedAt && lineNoLongerChecked(saved, key, before, current)) {
      const res = await outcome(api.admin.routes({ id: saved.id }).patch({ updatedAt: saved.updatedAt, lineVerified: false }));
      if (res.ok) setSaved((s) => ({ ...s, lineVerified: false, updatedAt: res.data.route.updatedAt }));
    }
    showToast(toast);
    setBusy(false);
  }

  async function setPublished(publish: boolean) {
    if (busy) return;
    setBusy(true);
    showToast(null);
    const { next, toast } = await placeSave.publishPlace(placeId, key, publish);
    if (next) keep(next);
    showToast(toast);
    setBusy(false);
  }

  async function remove() {
    if (busy || !(await confirmDialog({ title: t`削除しますか？`, body: deleteWarning, yes: t`削除する` }))) return;
    setBusy(true);
    const res = await outcome(api.admin.spots({ id: placeId }).delete());
    setBusy(false);
    if (!res.ok) return showToast({ kind: "error", text: messages[res.key] });
    showToast({ kind: "ok", text: t`削除しました。` });
    router.push("/admin/places");
  }

  return (
    <div className="flex flex-col gap-5">
      <PublishedEditDialog
        name={pending ? place.nameJa || t`名前のない経由地` : null}
        onProceed={() => {
          if (pending) dispatch(pending);
          setPending(null);
        }}
        onCancel={() => setPending(null)}
      />
      <ol>
        <PlacePanel
          place={place}
          number={number}
          selected
          dirty={dirty}
          busy={busy}
          canMoveUp={false}
          canMoveDown={false}
          invalidName={problems.some((p) => p.kind === "place_name")}
          invalidPhoto={problems.some((p) => p.kind === "place_photo_link")}
          stampFrom={stampFromChoices(state.present.places, key)}
          onChange={(patch) => edit({ type: "place", key, patch })}
          onRemove={() => void remove()}
          onMove={() => {}}
          canSave
          onSave={() => void save()}
          onPublish={() => void setPublished(true)}
          onUnpublish={() => void setPublished(false)}
          positionMap={<PositionMap lat={place.lat} lng={place.lng} onChange={(lat, lng) => edit({ type: "movePlace", key, lat, lng })} />}
        />
      </ol>
    </div>
  );
}
