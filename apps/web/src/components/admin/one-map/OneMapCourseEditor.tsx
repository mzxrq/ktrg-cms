"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { useErrorMessages } from "@/components/useErrorMessages";
import { api } from "@/lib/api";
import { outcome } from "@/lib/admin/admin-client";
import { draftFromServer, type RouteDraft } from "@/lib/admin/route-draft";
import { showToast } from "@/lib/admin/toast";
import type { AdminRoute, AdminSpot } from "@/lib/admin/types";
import { CourseMapEditor, PublishedEditGuard, RestoreOffer, SaveButton, SaveState, useConfirmRemoval } from "../CourseMapEditor";
import { useRouteDraft } from "../useRouteDraft";

type Props = { courseId: string; routeNames: Record<string, string>; locale: string; onDirtyChange: (dirty: boolean) => void; onSaved: () => void; onClose: () => void };

/**
 * One course edited in place on the one map (docs/one-map-editor-design.md, step 4): the course page's map editor and save
 * steps (`useRouteDraft`), with a save bar. Always seeded from a fresh read, so a second edit after a save never sends an old
 * `updatedAt` (the save would then be refused as a conflict).
 */
export function OneMapCourseEditor(props: Props) {
  const { t } = useLingui();
  const messages = useErrorMessages();
  const [loaded, setLoaded] = useState<{ initial: RouteDraft; sharedWith: Record<string, string[]> } | { error: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await outcome(api.admin.routes({ id: props.courseId }).get());
      if (cancelled) return;
      if (res.ok) {
        const body = res.data as unknown as { route: AdminRoute; spots: AdminSpot[]; sharedWith?: Record<string, string[]> };
        setLoaded({ initial: draftFromServer(body.route, body.spots), sharedWith: body.sharedWith ?? {} });
      } else setLoaded({ error: messages[res.key] });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- read once per course; the messages object is new every render
  }, [props.courseId]);

  if (!loaded) return <p className="text-lg">{t`読み込み中…`}</p>;
  if ("error" in loaded)
    return (
      <p role="alert" className="text-lg font-bold text-danger">
        {loaded.error}
      </p>
    );
  return <Editor {...props} initial={loaded.initial} sharedWith={loaded.sharedWith} />;
}

function Editor({ initial, sharedWith, routeNames, locale, onDirtyChange, onSaved, onClose }: Props & { initial: RouteDraft; sharedWith: Record<string, string[]> }) {
  const { t } = useLingui();
  const router = useRouter();
  const id = initial.id!;
  const d = useRouteDraft(initial, {
    // Everything that stops a save (name, municipalities, photo and video links) is on the course page's overview tab, not on the map.
    onShowProblem: (kind) =>
      showToast({
        kind: "error",
        text: t`保存できません。直す項目は、コースのページにあります。`,
        // The edits are not lost: the course page offers back the copy this browser keeps (RestoreOffer).
        action: { label: t`コースのページで直す`, run: () => router.push(`/admin/routes/${id}?tab=${kind.startsWith("place_") ? "places" : "overview"}`) },
      }),
    onCreated: () => {}, // a new course from the map is step 6
  });
  const { draft, saved, dirty, saving } = d;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  // After a save the faint layers and the course list are read again.
  const reported = useRef(saved);
  useEffect(() => {
    if (saved === reported.current) return;
    reported.current = saved;
    onSaved();
  }, [saved, onSaved]);

  const confirmRemoval = useConfirmRemoval(draft, sharedWith, routeNames, locale);

  return (
    <div className={`flex flex-col gap-4 ${saving ? "[&_fieldset]:pointer-events-none" : ""}`} aria-busy={saving}>
      <PublishedEditGuard d={d} />
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-line bg-paper py-3">
        <p className="min-w-0 flex-1 text-lg" aria-live="polite">
          <span className="font-bold">{t`「${draft.nameJa}」を編集中`}</span>{" "}
          <span className="text-muted"><SaveState d={d} locale={locale} /></span>
        </p>
        <button type="button" onClick={onClose} className="tap-target rounded-full border border-line px-5 text-lg font-bold">
          {t`編集をやめる`}
        </button>
        <SaveButton d={d} />
      </div>
      <RestoreOffer d={d} initial={initial} locale={locale} />
      <CourseMapEditor d={d} confirmRemoval={confirmRemoval} />
    </div>
  );
}
