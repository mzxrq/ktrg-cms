"use client";

import { useLingui } from "@lingui/react/macro";
import { useErrorMessages } from "@/components/useErrorMessages";
import { api } from "@/lib/api";
import { outcome } from "@/lib/admin/admin-client";
import { placeFromServer, type PlaceDraft, type RouteDraft } from "@/lib/admin/route-draft";
import { planSave } from "@/lib/admin/save-plan";

type Toast = { kind: "error" | "ok"; text: string };

/**
 * Saving and publishing one waypoint, and what to tell the admin after: the one copy, shared by the course editor
 * (useRouteDraft) and the waypoint's own page (WaypointEditor).
 */
export function usePlaceSave() {
  const { t } = useLingui();
  const messages = useErrorMessages();

  /**
   * Runs the save steps for one waypoint: `target` is the saved route with only this waypoint edited (or added).
   * `current` is what the server holds afterwards (null when nothing reached it), even after a failure, so the next try has fresh times.
   */
  async function savePlace(target: RouteDraft, before: RouteDraft, key: string): Promise<{ current: PlaceDraft | null; failed: boolean; toast: Toast }> {
    let current = before.places.find((p) => p.key === key) ?? null;
    let failure: string | null = null;
    let wasPublished = false;
    for (const step of planSave(target, before)) {
      if (step.op === "unpublishSpot") {
        const res = await outcome(api.admin.spots({ id: step.id }).unpublish.post());
        if (!res.ok) { failure = messages[res.key]; break; }
        current = { ...placeFromServer(res.data.spot), key };
        wasPublished = true;
      } else if (step.op === "createSpot" && before.id) {
        const res = await outcome(api.admin.routes({ id: before.id }).spots.post(step.body));
        if (!res.ok) { failure = messages[res.key]; break; }
        current = { ...placeFromServer(res.data.spot), key };
      } else if (step.op === "updateSpot") {
        const res = await outcome(api.admin.spots({ id: step.id }).patch({ updatedAt: current!.updatedAt!, ...step.body }));
        if (!res.ok) { failure = messages[res.key]; break; }
        current = { ...placeFromServer(res.data.spot), key };
      }
    }
    const toast: Toast = failure
      ? { kind: "error", text: wasPublished ? `${failure} ${t`この経由地は公開をやめました。`}` : failure }
      : { kind: "ok", text: wasPublished ? t`保存しました。この経由地は下書きに戻っています。もう一度「公開する」を押してください。` : t`この経由地を保存しました。` };
    return { current, failed: failure !== null, toast };
  }

  /** Publishes a saved waypoint or takes it off the site: the waypoint as the server now holds it, or null on a failure. */
  async function publishPlace(id: string, key: string, publish: boolean): Promise<{ next: PlaceDraft | null; toast: Toast }> {
    const res = await outcome(publish ? api.admin.spots({ id }).publish.post() : api.admin.spots({ id }).unpublish.post());
    if (!res.ok) return { next: null, toast: { kind: "error", text: messages[res.key] } };
    return { next: { ...placeFromServer(res.data.spot), key }, toast: { kind: "ok", text: publish ? t`公開しました。` : t`公開をやめました。` } };
  }

  return { savePlace, publishPlace };
}
