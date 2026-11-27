"use client";

import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { useLingui } from "@lingui/react/macro";
import { skipsPublishedWarning } from "./PublishedEditDialog";
import { useUnsavedGuard } from "./useUnsavedGuard";
import { usePlaceSave } from "./usePlaceSave";
import { useErrorMessages } from "@/components/useErrorMessages";
import { api } from "@/lib/api";
import { outcome } from "@/lib/admin/admin-client";
import { fillElevations } from "@/lib/admin/dem";
import { loadDemTile } from "@/lib/admin/dem-client";
import { draftFromServer, draftReducer, initialState, isDirty, placeFromServer, type DraftAction, type PlaceDraft, type RouteDraft } from "@/lib/admin/route-draft";
import { backupKey, firstRead, parseBackup, worthRestoring, writeBackup } from "@/lib/admin/draft-backup";
import { draftProblems, keepLaterEdits, planSave, restoreHeld, withLegIds, type DraftProblem } from "@/lib/admin/save-plan";
import type { ElevationStatus } from "./map-editor/MapEditor";
import { confirmDialog } from "@/components/ConfirmDialog";
import { showToast } from "@/lib/admin/toast";

const noSubscribe = () => () => {};

const isTyping =(target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

/** A short fingerprint of where a line's points are (not their heights), to tell whether it has changed. */
const lineSignature = (line: RouteDraft["line"]) => `${line.length}:${line.reduce((s, p, i) => s + (p[0] * 31 + p[1] * 17) * ((i % 7) + 1), 0).toFixed(6)}`;

/**
 * One course's draft and everything that saves it: undo, the copy kept in this browser, heights for the line, the unsaved guard,
 * and the save steps (optimistic concurrency, held-back waypoints). Shared by the course page and, later, the one-map editor.
 * Seeded from `initial` once: to edit another course, remount with a new `key`.
 */
export function useRouteDraft(
  initial: RouteDraft,
  { onShowProblem, onCreated }: { onShowProblem: (kind: string) => void; onCreated: (id: string) => void },
) {
  const { t } = useLingui();
  const messages = useErrorMessages();
  const placeSave = usePlaceSave();
  const [state, dispatch] = useReducer(draftReducer, initial, initialState);
  const draft = state.present;
  const [saved, setSaved] = useState<RouteDraft>(initial);
  const savedRef = useRef<RouteDraft>(initial);
  // The draft as it is now, for a save that has been running a while (see keepLaterEdits).
  const draftRef = useRef<RouteDraft>(initial);
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // An error with fields to fix offers a way to them.
  // A caller that has just found problems passes them: `problems` is only new on the next render.
  const setMessage = (m: { kind: "error" | "ok"; text: string } | null, now: DraftProblem[] = problems) =>
    showToast(m && (m.kind === "error" && now.length > 0 ? { ...m, action: { label: t`直す場所を見る`, run: () => showFirstProblem(now[0]!.kind) } } : m));
  const [problems, setProblems] = useState<DraftProblem[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [elevation, setElevation] = useState<ElevationStatus>("idle");
  const attempted = useRef<string | null>(null);

  // Editing a published waypoint turns it back into a draft: ask once first (unless the person said not to).
  const [pendingEdit, setPendingEdit] = useState<{ key: string; action: DraftAction } | null>(null);
  function guarded(key: string, action: DraftAction) {
    const p = draft.places.find((x) => x.key === key);
    if (p?.published && p.id !== null && !skipsPublishedWarning()) setPendingEdit({ key, action });
    else dispatch(action);
  }

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const dirty = isDirty(draft, saved);

  const setSavedCopy = (next: RouteDraft) => {
    savedRef.current = next;
    setSaved(next);
  };

  // ---- a copy of unsaved work, kept in this browser -------------------------------------------------------------
  // The stored copy is read in the browser only (the server render has none), as text so the snapshot stays the same between renders.
  // Read once per visit: reading again would find the copy this visit just wrote and offer it back mid-edit.
  const readStored = useMemo(() => firstRead(() => localStorage.getItem(backupKey(initial.id))), [initial.id]);
  const storedCopy = useSyncExternalStore(noSubscribe, readStored, () => null);
  const offered = useMemo(() => {
    const b = parseBackup(storedCopy);
    return worthRestoring(b, initial) ? b : null;
  }, [storedCopy, initial]);
  const [offerClosed, setOfferClosed] = useState(false);
  const offerOpen = offered !== null && !offerClosed;
  useEffect(() => {
    if (offerOpen) return; // the old copy is not overwritten (or dropped) before the person has chosen
    const timer = setTimeout(() => writeBackup(localStorage, draft, savedRef.current.updatedAt, dirty), 1000);
    return () => clearTimeout(timer);
  }, [draft, dirty, offerOpen]);

  // ---- leaving with unsaved work ---------------------------------------------------------------------------
  useUnsavedGuard(dirty);

  // ---- undo and redo from the keyboard (not while typing in a box: the box has its own) -----------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z" || isTyping(e.target)) return;
      e.preventDefault();
      dispatch({ type: e.shiftKey ? "redo" : "undo" });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ---- heights for a drawn line, from the elevation tiles ---------------------------------------------------------
  const needsHeights = draft.line.length >= 2 && !draft.line.every((p) => typeof p[2] === "number");
  useEffect(() => {
    if (!needsHeights) return;
    const signature = lineSignature(draft.line);
    if (attempted.current === signature) return; // already tried this exact line (tiles may be missing)
    let cancelled = false;
    const timer = setTimeout(async () => {
      setElevation("loading");
      const filled = await fillElevations(draft.line, loadDemTile);
      if (cancelled) return;
      attempted.current = signature;
      setElevation(filled.missing > 0 ? "partial" : "idle");
      dispatch({ type: "elevations", points: filled.points });
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft.line, needsHeights]);

  const heightsState: ElevationStatus = needsHeights ? elevation : "idle";

  // ---- saving ---------------------------------------------------------------------------------------------
  /** Brings the first red field into view (the caller opens the tab that holds it first) and puts the cursor there (after the tab that holds it has been drawn). */
  function showFirstProblem(kind: string) {
    onShowProblem(kind);
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>('[aria-invalid="true"]');
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus({ preventScroll: true });
    }, 120);
  }

  async function save() {
    if (saving || busyKey || !dirty) return;
    const found = draftProblems(draft);
    setProblems(found);
    // A problem with the route itself stops the save. An unfinished waypoint does not: it is held back (what was typed stays on
    // screen, in red) and everything else is saved, so one blank row never costs the rest of the work.
    const routeProblem = found.find((p) => !p.kind.startsWith("place_"));
    if (routeProblem) {
      setMessage({ kind: "error", text: t`保存できません。赤く示した項目を直してください。` }, found);
      showFirstProblem(routeProblem.kind); // the tab that holds the red item, and the item itself
      return;
    }
    const held = new Set(found.flatMap((p) => ("key" in p ? [p.key] : [])));
    const unsourced = draft.lineVerified && draft.lineSource.trim() === "";
    setOfferClosed(true); // saving settles the question of an old copy; the banner must not return for the copy this very edit made
    setSaving(true);
    setMessage(null);
    // What is sent: without the held waypoints (a saved one is sent as it was saved, a new one is left out).
    const snapshot: RouteDraft =
      held.size === 0
        ? draft
        : { ...draft, places: draft.places.flatMap((p) => (!held.has(p.key) ? [p] : savedRef.current.places.filter((s) => s.key === p.key))) };
    let routeId = snapshot.id;
    let routeUpdatedAt = snapshot.updatedAt;
    let base = savedRef.current;
    const ids = new Map(snapshot.places.map((p) => [p.key, p.id]));
    // After a waypoint is unpublished its update time changes: the changes are saved against the new one.
    const freshUpdatedAt = new Map<string, string>();
    const unpublished: string[] = [];
    const steps = planSave(snapshot, snapshot.id === null ? null : base);
    let failure: string | null = null;

    for (const step of steps) {
      if (step.op === "unpublishSpot") {
        const res = await outcome(api.admin.spots({ id: step.id }).unpublish.post());
        if (!res.ok) {
          failure = messages[res.key];
          break;
        }
        const next: PlaceDraft = { ...placeFromServer(res.data.spot), key: step.key };
        freshUpdatedAt.set(step.key, next.updatedAt!);
        unpublished.push(next.nameJa || t`名前のない経由地`);
        base = { ...base, places: base.places.map((p) => (p.key === step.key ? next : p)) };
        setSavedCopy(base);
      } else if (step.op === "deleteSpot") {
        const res = await outcome(api.admin.spots({ id: step.id }).delete());
        if (!res.ok) {
          failure = messages[res.key];
          break;
        }
        base = { ...base, places: base.places.filter((p) => p.key !== step.key) };
        setSavedCopy(base);
      } else if (step.op === "createRoute") {
        const res = await outcome(api.admin.routes.post(withLegIds(step.body, ids)));
        if (!res.ok) {
          failure = messages[res.key];
          break;
        }
        routeId = res.data.route.id;
        routeUpdatedAt = res.data.route.updatedAt;
        dispatch({ type: "savedRoute", id: routeId, updatedAt: routeUpdatedAt });
        base = { ...snapshot, id: routeId, updatedAt: routeUpdatedAt, places: [] };
        setSavedCopy(base);
      } else if (step.op === "updateRoute") {
        const res = await outcome(api.admin.routes({ id: routeId! }).patch({ updatedAt: routeUpdatedAt!, ...withLegIds(step.body, ids) }));
        if (!res.ok) {
          failure = messages[res.key];
          break;
        }
        routeUpdatedAt = res.data.route.updatedAt;
        dispatch({ type: "savedRoute", id: routeId!, updatedAt: routeUpdatedAt });
        base = { ...snapshot, id: routeId, updatedAt: routeUpdatedAt, places: base.places };
        setSavedCopy(base);
      } else if (step.op === "createSpot") {
        const res = await outcome(api.admin.routes({ id: routeId! }).spots.post(step.body));
        if (!res.ok) {
          failure = messages[res.key];
          break;
        }
        const place: PlaceDraft = { ...placeFromServer(res.data.spot), key: step.key };
        ids.set(step.key, place.id);
        dispatch({ type: "savedPlace", key: step.key, place });
        base = { ...base, places: [...base.places, place] };
        setSavedCopy(base);
      } else if (step.op === "updateSpot") {
        const current = snapshot.places.find((p) => p.key === step.key)!;
        const res = await outcome(api.admin.spots({ id: step.id }).patch({ updatedAt: freshUpdatedAt.get(step.key) ?? current.updatedAt!, ...step.body }));
        if (!res.ok) {
          failure = messages[res.key];
          break;
        }
        const place: PlaceDraft = { ...placeFromServer(res.data.spot), key: step.key };
        dispatch({ type: "savedPlace", key: step.key, place });
        base = { ...base, places: base.places.map((p) => (p.key === step.key ? place : p)) };
        setSavedCopy(base);
      } else if (step.op === "orderSpots") {
        const order = step.keys.map((k) => ids.get(k)!);
        const res = await outcome(api.admin.routes({ id: routeId! }).spots.order.put({ ids: order }));
        if (!res.ok) {
          failure = messages[res.key];
          break;
        }
        const byKey = new Map(base.places.map((p) => [p.key, p]));
        base = { ...base, places: step.keys.flatMap((k) => (byKey.has(k) ? [byKey.get(k)!] : [])) };
        setSavedCopy(base);
      }
    }

    if (failure) {
      // A waypoint that was taken off the site before the failure stays off: say so.
      const names = unpublished.join("、");
      setMessage({ kind: "error", text: unpublished.length > 0 ? `${failure} ${t`すでに公開をやめた経由地があります（${names}）。「経由地」タブで確かめてください。`}` : failure }, found);
      setSaving(false);
      return;
    }

    // Take over what the server now holds, so the screen shows the truth (and the next save has fresh times).
    const fresh = await outcome(api.admin.routes({ id: routeId! }).get());
    if (fresh.ok) {
      const next = draftFromServer(fresh.data.route, fresh.data.spots);
      const index = snapshot.places.findIndex((p) => p.key === selectedKey);
      dispatch({ type: "loaded", draft: keepLaterEdits(restoreHeld(next, draft, held), draft, draftRef.current) });
      setSavedCopy(next);
      setSelectedKey(index >= 0 ? (next.places[index]?.key ?? null) : null);
      attempted.current = null;
    }
    const heldCount = held.size;
    setMessage(
      heldCount === 0
        ? { kind: unsourced ? "error" : "ok", text: unsourced ? t`保存しました。ただし、情報源が空のため、線は「確認していない」状態で保存しました。情報源を入れて、もう一度保存してください。` : t`保存しました。` }
        : { kind: "error", text: t`保存しました。ただし、未完成の経由地が${heldCount}件あり、まだ保存していません（赤く示した項目）。` },
      heldCount === 0 ? [] : found,
    );
    setProblems(heldCount === 0 ? [] : found);
    setSaving(false);
    if (snapshot.id === null) onCreated(routeId!);
  }

  /**
   * Saves one waypoint on its own: the rest of the draft (the route's fields, the other waypoints, the order) stays as typed.
   * The same steps as a full save, planned against a copy of the saved route that has only this waypoint edited.
   */
  async function savePlace(key: string) {
    const place = draft.places.find((p) => p.key === key);
    const before = savedRef.current;
    if (!place || !before.id || saving || busyKey) return;
    const found = draftProblems({ ...before, places: [place] }).filter((p) => "key" in p && p.key === key);
    if (found.length > 0) {
      setProblems((old) => [...old.filter((p) => !("key" in p && p.key === key)), ...found]);
      setMessage({ kind: "error", text: t`保存できません。赤く示した項目を直してください。` }, found);
      return;
    }
    setProblems((old) => old.filter((p) => !("key" in p && p.key === key)));
    const isNew = !before.places.some((p) => p.key === key);
    const target: RouteDraft = { ...before, places: isNew ? [...before.places, place] : before.places.map((p) => (p.key === key ? place : p)) };
    setBusyKey(key);
    setMessage(null);
    const { current, toast } = await placeSave.savePlace(target, before, key);
    if (current && current !== (before.places.find((p) => p.key === key) ?? null)) {
      // Whatever was saved before a failure is on the server: take it over, so the next try has fresh times.
      const saved = current;
      dispatch({ type: "savedPlace", key, place: saved });
      setSavedCopy({ ...savedRef.current, places: isNew && !savedRef.current.places.some((p) => p.key === key) ? [...savedRef.current.places, saved] : savedRef.current.places.map((p) => (p.key === key ? saved : p)) });
    }
    setMessage(toast);
    setBusyKey(null);
  }

  // Takes every published waypoint off the site at once. The route itself stays in the list, shown as "coming soon" (準備中).
  async function unpublishAll() {
    const live = draft.places.filter((p) => p.id && p.published);
    if (!draft.id || live.length === 0 || busyKey || saving) return;
    const count = live.length;
    if (!(await confirmDialog({ title: t`公開をやめますか？`, body: t`公開中の${count}か所を、すべて公開をやめます。コースは「準備中」として一覧に残ります。よろしいですか？`, yes: t`公開をやめる` }))) return;
    setBusyKey("all");
    setMessage(null);
    // One request: the server takes them all back in one step, so it is all or nothing.
    const res = await outcome(api.admin.routes({ id: draft.id })["unpublish-spots"].post());
    if (!res.ok) {
      setMessage({ kind: "error", text: messages[res.key] });
      setBusyKey(null);
      return;
    }
    let places = savedRef.current.places;
    for (const spot of res.data.spots) {
      const key = draft.places.find((p) => p.id === spot.id)?.key;
      if (!key) continue;
      const next: PlaceDraft = { ...placeFromServer(spot), key };
      dispatch({ type: "savedPlace", key, place: next });
      places = places.map((p) => (p.key === key ? next : p));
    }
    setSavedCopy({ ...savedRef.current, places });
    setMessage({ kind: "ok", text: t`${count}か所の公開をやめました。コースは「準備中」として一覧に残ります。` });
    setBusyKey(null);
  }

  async function setPublished(key: string, publish: boolean) {
    const place = draft.places.find((p) => p.key === key);
    if (!place?.id || busyKey) return;
    setBusyKey(key);
    setMessage(null);
    const { next, toast } = await placeSave.publishPlace(place.id, key, publish);
    if (next) {
      dispatch({ type: "savedPlace", key, place: next });
      setSavedCopy({ ...savedRef.current, places: savedRef.current.places.map((p) => (p.key === key ? next : p)) });
    }
    setMessage(toast);
    setBusyKey(null);
  }

  return {
    state,
    dispatch,
    draft,
    saved,
    dirty,
    saving,
    busyKey,
    problems,
    setMessage,
    selectedKey,
    setSelectedKey,
    pendingEdit,
    setPendingEdit,
    guarded,
    offered,
    offerOpen,
    setOfferClosed,
    heightsState,
    save,
    savePlace,
    unpublishAll,
    setPublished,
  };
}
