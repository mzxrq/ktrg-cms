"use client";

import { onGlobe } from "@/lib/admin/save-plan";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent, Marker } from "maplibre-gl";
import { isAllSmooth } from "@/lib/admin/drawn-path";
import { parseGpx, type GpxWaypoint } from "@/lib/admin/gpx";
import { applyGpxElevations } from "@/lib/admin/gpx-elevation";
import { LEG_HIT, LEG_SOURCE, legFeatures, legLayers } from "@/lib/admin/leg-map";
import { backChoices, backLeg, backPairs, isStraightBack, guideRoute, insertAnchor, insertGuidePoint, legFromPath, legOf, MAX_GUIDE_POINTS, moveAnchor, moveGuidePoint, pairId, pairsOf, pathOfLeg, pathStops, pointsFromAnchors, removeAnchors, removeGuidePoint, RIDE_MODES, setAllCurves, sidePairs, toggleAnchorCurve, withAutoLegs, type GuidePoint, type Leg, type Path, type RideMode, type Stop } from "@/lib/admin/legs";
import { simplify, type LngLatEle } from "@/lib/admin/line";
import { legTime } from "@/lib/leg-times";
import { searchPlaces, type PlaceHit } from "@/lib/admin/place-search";
import { buildLine, closeLineGaps } from "@/lib/admin/route-builder";
import { roundLine, type SnapPoint } from "@/lib/admin/snap";
import { boundsOf, editorBaseVisibility, editorBases, editorStyle, terrainLayerId, zoomLimits, type EditorBase } from "@/lib/map";
import { type PointKind } from "@/lib/point-kinds";
import { ChevronDownIcon, CursorIcon, FitIcon, GuideIcon, PencilIcon, PinIcon, RedoIcon, TerrainIcon, TrashIcon, UndoIcon, XIcon } from "@/components/admin/admin-icons";
import { PlaceList } from "./PlaceList";
import { CourseAreaEditor } from "../CourseAreaEditor";
import type { Bounds } from "@/lib/route-geometry";
import { createMarkerElement } from "@/components/map/MapMarker";
import type { StopRole } from "@/lib/route-stops";

/** The map source and layer of the 遥拝 links. */
const YOHAI_SOURCE = "yohai-links";

export interface EditorPlace {
  key: string;
  lat: number | null;
  lng: number | null;
  /** The number on the marker: its place among the waypoints with a stamp. A waypoint without a stamp is a small dot (null). */
  number: number | null;
  name: string;
  stampable: boolean;
  /** An optional visit beside the way (寄り道): the line need not pass through it. */
  stopBy: boolean;
  kind: PointKind;
  /** Not connected to the route (遥拝): no path is drawn to it. */
  detached?: boolean;
  /** Its saved id (null until saved): what a 遥拝 link points to. */
  id?: string | null;
  /** The waypoint it is worshipped from (遥拝), by key: a dashed link is drawn to it. */
  stampFromKey?: string | null;
  /** Visitors can see it: it cannot be deleted, and editing it turns it back into a draft. */
  published: boolean;
  /** Where the walk starts and ends (blue and orange pins), as visitors see it. */
  role?: StopRole;
  /** An info-only place (案内のみ): described on the map, no stamp. */
  info?: boolean;
}

/** What the list under the map changes on a waypoint by itself; the rest of its settings come from placeSettings. */
export interface PlacePatch {
  nameJa?: string;
  /** The saved waypoint it is worshipped from (遥拝), or null: chosen by clicking its pin. */
  stampSpotId?: string | null;
}

export type ElevationStatus = "idle" | "loading" | "partial";

export interface MapEditorProps {
  /** The whole line (the legs joined): for the length, for fitting the view. */
  line: LngLatEle[];
  /** The line cut into one leg for each pair of stops. Drawing or finding a leg never touches the others. */
  legs: Leg[];
  places: EditorPlace[];
  selectedKey: string | null;
  distanceKm: number | null;
  climbM: number | null;
  elevationStatus: ElevationStatus;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** A whole track (a GPX file): the draft cuts it into legs at the stops. */
  onLine: (points: LngLatEle[]) => void;
  onSetLeg: (leg: Leg) => void;
  /** Several legs at once, as one step to undo. This is the full list of legs. */
  onSetLegs: (legs: Leg[]) => void;
  /** Legs the editor routed by itself after a stop was added or moved (the full list); undone together with that change. */
  onAutoLegs: (legs: Leg[]) => void;
  onClearLeg: (from: string, to: string) => void;
  onClearLegs: () => void;
  /** The same line with new elevations (taken from a GPX file); the shape does not change. */
  onHeights: (points: LngLatEle[]) => void;
  /** Cut the loose line into legs at the stops even though they do not follow it. */
  onSplitLine: () => void;
  /** `after`: put it right after this waypoint (between two others) instead of at the end. */
  onAddPlace: (lat: number, lng: number, after?: string) => void;
  /** The waypoints in a new order (all keys). Legs that still join neighbours stay; the others are reconciled. */
  onReorderPlaces: (keys: string[]) => void;
  /** A route that ends where it starts: adds an end point (not a stamp place) at exactly the position of this waypoint. */
  onAddEndAt: (key: string) => void;
  /** Several places at once (the named points of a GPX file). */
  onAddPlaces: (places: { key: string; name: string; lat: number; lng: number }[]) => void;
  onMovePlace: (key: string, lat: number, lng: number) => void;
  onRemovePlace: (key: string) => void;
  onSelectPlace: (key: string | null) => void;
  /** Changes a waypoint's name, kind, stamp switch or side-trip switch. */
  onPatchPlace: (key: string, patch: PlacePatch) => void;
  /** The open waypoint's 種類 and switches (WaypointTypeFields, the same as the 経由地 tab), with the map's 遥拝 pick button. */
  placeSettings: (key: string, pickOnMap: ReactNode) => ReactNode;
  /** The course's box on the visitors' overview map (コースの範囲), edited on this same map; left out where there is none. */
  area?: { value: Bounds | null; onChange: (area: Bounds | null) => void };
  /** Asks the route-finding service for a walking line through these points (the editor says what went wrong). */
  onSnap: (points: SnapPoint[]) => Promise<{ ok: true; line: LngLatEle[] } | { ok: false; message: string }>;
}

// Four tools for the person: select (move the map, move stops, move the points of the chosen leg), add a stop, draw a leg, and
// put guide points on a leg (invisible marks that tell the route-finding service which way to go, like Navivi's via points).
type Mode = "pan" | "place" | "draw" | "guide";

const MAX_POINTS = 2000;
const NO_PATH: Path = { anchors: [], curves: [] };
// Where the map starts when there is nothing to show yet: the Katsuragi area.
const START = { center: [135.45, 34.45] as [number, number], zoom: 9 };
// A point of the chosen leg (Navivi's anchor): a square is a sharp corner, a circle is a smooth bend.
const anchorClass =
  "block size-3.5 min-h-0 min-w-0 cursor-grab rounded-[3px] border-2 border-white bg-ink p-0 shadow-md active:cursor-grabbing data-[smooth=true]:size-4 data-[smooth=true]:rounded-full data-[selected=true]:bg-brand data-[selected=true]:ring-2 data-[selected=true]:ring-ink";
// A guide point of the chosen leg: a dashed orange ring. Visitors never see it; it only steers the route-finding service.
const guideClass =
  "block size-4 min-h-0 min-w-0 cursor-grab rounded-full border-[3px] border-dashed border-[var(--color-goal)] bg-paper p-0 shadow-md active:cursor-grabbing";
const chipClass = "inline-flex h-11 min-h-0 min-w-0 items-center justify-center gap-1.5 rounded-full border border-line bg-paper px-3 text-sm font-bold hover:bg-surface disabled:opacity-40 disabled:hover:bg-paper";
const floatClass = "flex items-center gap-0.5 rounded-xl border border-line bg-paper/95 p-1 shadow-md backdrop-blur-sm";
const iconBtn = "inline-flex shrink-0 whitespace-nowrap h-11 min-h-0 min-w-11 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-bold [&:not([aria-pressed=true])]:hover:bg-surface disabled:opacity-40 disabled:hover:bg-transparent";
const toolClass = "tap-target inline-flex items-center justify-center rounded-full border-2 px-3 text-base font-bold disabled:opacity-40";

type Actions = {
  collection: (preview: { id: string; points: LngLatEle[] } | null) => ReturnType<typeof legFeatures>;
  redraw: (preview: { id: string; points: LngLatEle[] } | null) => void;
  mapClick: (e: MapMouseEvent) => void;
  clickAnchor: (i: number) => void;
  toggleAnchor: (i: number) => void;
  previewAnchor: (i: number, at: { lat: number; lng: number }) => void;
  dropAnchor: (i: number, at: { lat: number; lng: number }) => void;
  chooseTool: (tool: "select" | "place" | "draw" | "guide") => void;
  clickGuide: (i: number) => void;
  dropGuide: (i: number, at: { lat: number; lng: number }) => void;
  toggleEraser: () => void;
  removeChosenAnchor: () => void;
  hasAnchor: () => boolean;
  leaveDraw: () => void;
};

/** A leg's points with both ends exactly on its stops (a router's line is rounded, or stops short of them). */
function withEnds(line: readonly LngLatEle[], from: Stop, to: Stop): LngLatEle[] {
  return [[from.lng, from.lat], ...line.slice(1, -1), [to.lng, to.lat]];
}

type Pair = { from: Stop; to: Stop; side?: true; back?: true };

/** The leg of a chosen waypoint: the one that starts there, or the side trip that leads to it. */
const legOfWaypoint = (pairs: readonly Pair[], key: string | null): Pair | undefined =>
  pairs.find((p) => !p.side && !p.back && p.from.key === key) ?? pairs.find((p) => p.side && p.to.key === key);

/** The leg to start drawing: the one of the chosen waypoint, else the first pair without a leg, else the first pair. */
function firstLeg(pairs: readonly Pair[], legs: readonly Leg[], selectedKey: string | null): string | null {
  const own = legOfWaypoint(pairs, selectedKey);
  const empty = pairs.find((p) => !legOf(legs, p.from.key, p.to.key));
  const first = own ?? empty ?? pairs[0];
  return first ? pairId(first) : null;
}

export function MapEditor(props: MapEditorProps) {
  const { t } = useLingui();
  const [mode, setMode] = useState<Mode>("pan");
  const [ready, setReady] = useState(false);
  // The map for the コースの範囲 side of the panel (it draws its box on this map), and what the panel shows.
  const [onMap, setOnMap] = useState<{ map: MapLibreMap; ml: typeof import("maplibre-gl") } | null>(null);
  const [panel, setPanel] = useState<"places" | "area">("places");
  const [panelOpen, setPanelOpen] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [terrain, setTerrain] = useState(false);
  const [base, setBase] = useState<EditorBase>("std");
  const [waypoints, setWaypoints] = useState<GpxWaypoint[] | null>(null);
  const [dropping, setDropping] = useState(false);
  const [working, setWorking] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<PlaceHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  // The leg being worked on, named by the key of its first stop; and the point of it that is chosen (new points go after it).
  const [chosenId, setActiveId] = useState<string | null>(null);
  const [anchorAt, setAnchorAt] = useState<{ from: string | null; index: number } | null>(null);
  const [eraser, setEraser] = useState(false);
  // With the place tool, the next pin goes right after the chosen waypoint (the new pin is chosen in turn, so pins chain in order).
  // "Add after this" in the list turns it off again (afterOff) until another tool is used.
  const [afterOff, setAfterOff] = useState(false);
  const insertAfterRef = useRef<string | null>(null);
  // A waypoint that has no position yet: the next click on the map gives it one (any tool; the click is not used for anything else).
  const [locating, setLocating] = useState<string | null>(null);
  const locatingRef = useRef<string | null>(null);
  useEffect(() => {
    locatingRef.current = locating;
  });
  const insertAfter = mode === "place" && !afterOff ? props.selectedKey : null;
  useEffect(() => {
    insertAfterRef.current = insertAfter;
  });

  const container = useRef<HTMLDivElement>(null);
  const heightsInput = useRef<HTMLInputElement>(null);
  const [gpxMenu, setGpxMenu] = useState(false);
  useEffect(() => {
    if (!gpxMenu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as Element | null)?.closest?.('[aria-haspopup="menu"], [role="menu"]')) setGpxMenu(false);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", close);
    };
  }, [gpxMenu]);
  const fileInput = useRef<HTMLInputElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mlRef = useRef<typeof import("maplibre-gl") | null>(null);
  const markers = useRef(new Map<string, { marker: Marker; el: HTMLButtonElement; shape: string }>());
  const anchorMarkers = useRef<Marker[]>([]);
  const guideMarkers = useRef<Marker[]>([]);
  // Choosing on the map the waypoint a place is worshipped from (遥拝): the key of that place while a pin is awaited.
  const [picking, setPicking] = useState<string | null>(null);
  const pickingRef = useRef<string | null>(null);
  useEffect(() => {
    pickingRef.current = picking;
  }, [picking]);
  const justDragged = useRef(false);
  const modeRef = useRef<Mode>("pan");
  const latest = useRef(props);
  const actions = useRef<Actions>({} as Actions);

  // The handlers below are created once; they read the newest props and mode through these refs.
  useEffect(() => {
    latest.current = props;
  });
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // ---- the stops, the legs between them, and the one being worked on -----------------------------------------------
  const stops = useMemo(() => pathStops(props.places), [props.places]);
  // The legs of the route, then the side trips out to the stop-by places. A leg is named by the stop it runs to (unique, also for a side trip).
  // Then the way back (return legs, 戻る道): a leg per pair of stops, named by both its stops (it can end on a stop another leg ends on).
  const pairs: Pair[] = useMemo(
    () => [...pairsOf(stops), ...sidePairs(props.places).map((p) => ({ ...p, side: true as const })), ...backPairs(stops, props.legs).map((p) => ({ ...p, back: true as const }))],
    [stops, props.places, props.legs],
  );
  // A leg drawn again on a return pair stays a return leg (the places that build legs do not know about the kinds).
  const backKeys = new Set(pairs.filter((p) => p.back).map((p) => `${p.from.key}>${p.to.key}`));
  const tagBack = (leg: Leg): Leg => (backKeys.has(`${leg.from}>${leg.to}`) && !leg.back ? { ...leg, back: true } : leg);
  const setLeg = (leg: Leg) => props.onSetLeg(tagBack(leg));
  // The chosen leg is read as nothing once its pair of stops is gone, and the chosen point only counts on the leg it was chosen on.
  const activePair = pairs.find((p) => pairId(p) === chosenId) ?? null;
  const activeId = activePair ? pairId(activePair) : null;
  const anchorIdx = anchorAt && anchorAt.from === activeId ? anchorAt.index : null;
  const setAnchorIdx = (index: number | null) => setAnchorAt(index === null ? null : { from: activeId, index });
  const activeLeg = activePair ? legOf(props.legs, activePair.from.key, activePair.to.key) : undefined;
  const activePath = useMemo(() => (activeLeg ? pathOfLeg(activeLeg) : NO_PATH), [activeLeg]);
  const nameOf = useMemo(() => new Map(props.places.map((p) => [p.key, p.name || t`（名称未設定）`])), [props.places, t]);

  // ---- what the handlers do (created each render so they see this render's state; the map calls them through `actions`) ----
  /** Edits the path of the chosen leg (a leg that has none yet starts from no points) and saves the result as that leg. */
  function editPath(update: (p: Path) => Path) {
    if (!activePair) return;
    const next = update(activePath);
    // Drawn by hand (手描き): no `auto`, so from now on the editor never routes it on its own.
    setLeg({ ...legFromPath(activePair.from, activePair.to, next), ...(activeLeg?.via ? { via: activeLeg.via } : {}) });
  }

  /**
   * Finds the way of the chosen leg again through these guide points (Navivi's via points): the route-finding service is given the
   * two stops with the guide points between them, so it cannot pick a shorter but worse way. The guide points stay on the leg for
   * the next time. When no way is found the guide points are kept and the line is left as it was. This is one search of the
   * route-finding service (a limited allowance shared by everyone), so it runs only when the person asks (the ルートを検索 button),
   * never on its own after a guide point is added, moved or removed.
   */
  async function routeThroughGuides(via: GuidePoint[]) {
    if (!activePair || working) return;
    const { from, to } = activePair;
    const own = activeLeg;
    const keep = { ...(own?.ride ? { ride: own.ride } : {}), ...(activePair.side ? { side: true as const } : {}), ...(via.length > 0 ? { via } : {}) };
    const points = guideRoute(from, to, via);
    setWorking(true);
    setNote(via.length > 0 ? t`ガイド点を通るルートを検索しています…` : t`ルートを検索しています…`);
    let line: LngLatEle[] | null = null;
    let message = "";
    let fellBack = false;
    const result = await props.onSnap(points);
    if (result.ok) line = await closeLineGaps(result.line, points);
    else {
      message = result.message;
      // The service is not set up, is over its allowance or did not answer: GSI's own trail map does the same job without a key
      // (the note then says so, because it can choose a different way).
      const built = await buildLine(points, "trail");
      if (built.straightHops < points.length - 1) {
        line = built.line;
        fellBack = true;
      }
    }
    setWorking(false);
    if (!line) {
      setLeg({ from: from.key, to: to.key, points: own?.points ?? [[from.lng, from.lat], [to.lng, to.lat]], ...keep });
      return setNote(message || t`ルートが見つかりませんでした。ガイド点はそのまま残っています。`);
    }
    setLeg({ from: from.key, to: to.key, points: withEnds(simplify(roundLine(line), MAX_POINTS), from, to), ...keep });
    setNote(
      fellBack
        ? t`ルート検索サービスが利用できなかったため、国土地理院の地図データからルートを作成しました。通常と異なるルートになる場合があるため、形状を確認してください。「元に戻す」で元のルートに戻せます。`
        : t`ガイド点を通るルートを再作成しました。形状を確認してから保存してください。「元に戻す」で元のルートに戻せます。`,
    );
  }

  /** Puts the guide points on the chosen leg (a leg with no line yet is made straight). It does not search: the ルートを検索 button does. */
  function changeGuides(via: GuidePoint[]) {
    if (!activePair) return;
    const base: Leg = activeLeg ?? { from: activePair.from.key, to: activePair.to.key, points: [[activePair.from.lng, activePair.from.lat], [activePair.to.lng, activePair.to.lat]] };
    setLeg({ ...base, via: via.length > 0 ? via : undefined }); // (an undefined member is not saved)
    setNote(via.length > 0 ? t`ガイド点を変更しました。「ルートを検索」を押すと、これらの点を通るルートを検索します（押したときのみ1回検索）。` : t`ガイド点をすべて削除しました。ルート線はそのままです。`);
  }

  function makeActions(): Actions {
    return {
    collection: (preview) => legFeatures(pairs, props.legs, activeId, preview, props.line),
    redraw: (preview) => {
      const source = mapRef.current?.getSource(LEG_SOURCE) as GeoJSONSource | undefined;
      source?.setData(actions.current.collection(preview));
    },
    mapClick: (e) => {
      const m = modeRef.current;
      const locate = locatingRef.current;
      if (locate) {
        setLocating(null);
        latest.current.onMovePlace(locate, e.lngLat.lat, e.lngLat.lng);
        latest.current.onSelectPlace(locate);
        return;
      }
      if (m === "place") {
        const after = insertAfterRef.current ?? undefined;
        return latest.current.onAddPlace(e.lngLat.lat, e.lngLat.lng, after);
      }
      if (m === "guide") {
        if (!activePair) return;
        const cur = activeLeg?.via ?? [];
        if (cur.length >= MAX_GUIDE_POINTS) return setNote(t`ガイド点は1区間につき${MAX_GUIDE_POINTS}個までです。`);
        changeGuides(insertGuidePoint(activePair.from, activePair.to, cur, [e.lngLat.lng, e.lngLat.lat]));
        return;
      }
      if (m === "draw") {
        if (!activePair) return;
        // New points go after the chosen point, or at the end.
        const at = anchorIdx !== null && anchorIdx < activePath.anchors.length ? anchorIdx + 1 : activePath.anchors.length;
        editPath((p) => insertAnchor(p, at, [e.lngLat.lat, e.lngLat.lng]));
        setAnchorIdx(at);
        return;
      }
      const hit = mapRef.current?.queryRenderedFeatures(e.point, { layers: [LEG_HIT] })[0];
      const id = hit ? (hit.properties as { id?: string } | null)?.id : undefined;
      setActiveId(id ? id : null);
      // Picking a leg (or none) lets go of the waypoint chosen before, so its ring does not stay on while another leg is worked on.
      latest.current.onSelectPlace(null);
    },
    clickAnchor: (i) => {
      if (justDragged.current) return;
      if (eraser) {
        editPath((p) => removeAnchors(p, new Set([i])));
        setAnchorIdx(null);
      } else setAnchorIdx(anchorIdx === i ? null : i);
    },
    toggleAnchor: (i) => editPath((p) => toggleAnchorCurve(p, i)),
    // In the guide tool a guide point is removed by clicking it, or moved by dragging it. Neither searches for a way.
    clickGuide: (i) => {
      if (justDragged.current || modeRef.current !== "guide") return;
      changeGuides(removeGuidePoint(activeLeg?.via ?? [], i));
    },
    dropGuide: (i, at) => {
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 250);
      changeGuides(moveGuidePoint(activeLeg?.via ?? [], i, [at.lng, at.lat]));
    },
    previewAnchor: (i, at) => {
      if (!activePair) return;
      const moved = moveAnchor(activePath, i, [at.lat, at.lng]);
      actions.current.redraw({ id: pairId(activePair), points: pointsFromAnchors(activePair.from, activePair.to, moved.anchors, moved.curves) });
    },
    dropAnchor: (i, at) => {
      justDragged.current = true;
      setTimeout(() => (justDragged.current = false), 250);
      editPath((p) => moveAnchor(p, i, [at.lat, at.lng]));
    },
    chooseTool: (tool) => {
      setNote(null);
      setAfterOff(false);
      if (tool === "select") return setMode("pan");
      if (tool === "place") return setMode("place");
      if (pairs.length === 0) return setNote(tool === "guide" ? t`ガイド点を配置するには、先に経由地を2か所以上配置してください（寄り道は除く）。` : t`線を描くには、先に経由地を2か所以上配置してください（寄り道は除く）。`);
      if (!activePair) setActiveId(firstLeg(pairs, props.legs, props.selectedKey));
      setMode(tool === "guide" ? "guide" : "draw");
    },
    toggleEraser: () => setEraser((e) => !e),
    hasAnchor: () => anchorIdx !== null,
    removeChosenAnchor: () => {
      if (anchorIdx === null) return;
      editPath((p) => removeAnchors(p, new Set([anchorIdx])));
      setAnchorIdx(null);
    },
    leaveDraw: () => {
      setEraser(false);
      setMode("pan");
    },
    };
  }

  // The handlers the map calls are put here after every render, before the effects below use them.
  useEffect(() => {
    actions.current = makeActions();
  });

  // Choosing a waypoint chooses the leg that starts there (adjusted while rendering, the way React recommends).
  const [seenSelected, setSeenSelected] = useState(props.selectedKey);
  if (seenSelected !== props.selectedKey) {
    setSeenSelected(props.selectedKey);
    const own = legOfWaypoint(pairs, props.selectedKey);
    if (own) setActiveId(pairId(own));
  }

  // ---- the map, created once -----------------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;
    const placeMarkers = markers.current;

    (async () => {
      const ml = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      ml.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
      const { line, places } = latest.current;
      const bounds = boundsOf([...line.map((p) => ({ lng: p[0], lat: p[1] })), ...places.flatMap((p) => (p.lat === null || p.lng === null ? [] : [{ lat: p.lat, lng: p.lng }]))]);
      map = new ml.Map({
        container: container.current,
        style: editorStyle(), // mapping needs the detailed maps; visitors see the one chosen in the site settings
        center: START.center,
        zoom: START.zoom,
        bounds: bounds ?? undefined,
        fitBoundsOptions: { padding: 60, maxZoom: 15, animate: false },
        minZoom: zoomLimits.min,
        maxZoom: zoomLimits.max,
        dragRotate: false,
        pitchWithRotate: false,
        doubleClickZoom: false, // a double click on a point makes it smooth or a corner
        attributionControl: { compact: false },
      });
      map.touchZoomRotate.disableRotation();
      map.on("error", () => {});
      mapRef.current = map;
      mlRef.current = ml;

      let started = false;
      const start = () => {
        if (started || cancelled || !map || !map.isStyleLoaded()) return;
        started = true;
        map.addSource(LEG_SOURCE, { type: "geojson", data: actions.current.collection(null) });
        for (const layer of legLayers()) map.addLayer(layer);
        setOnMap({ map, ml });
        setReady(true);
      };
      map.on("styledata", start);
      map.on("load", start);
      start();

      // A click on the map: puts a place there (place tool), adds a point to the chosen leg (draw tool), or chooses the leg
      // under the click (select tool).
      map.on("click", (e) => actions.current.mapClick(e));
    })();

    return () => {
      cancelled = true;
      for (const { marker } of placeMarkers.values()) marker.remove();
      placeMarkers.clear();
      for (const m of anchorMarkers.current) m.remove();
      anchorMarkers.current = [];
      for (const m of guideMarkers.current) m.remove();
      guideMarkers.current = [];
      map?.remove(); // CLAUDE.md: the map is always removed on unmount
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // ---- the legs on the map ------------------------------------------------------------------------------------
  useEffect(() => {
    if (ready) actions.current.redraw(null);
  }, [ready, props.legs, props.line, pairs, activeId]);

  // ---- the tool ----------------------------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getCanvas().style.cursor = locating || mode === "place" || ((mode === "draw" || mode === "guide") && activePair) ? "crosshair" : "";
    for (const { marker } of markers.current.values()) marker.setDraggable(mode === "pan" || mode === "place");
  }, [mode, ready, activePair, locating]);

  // ---- the points of the chosen leg ----------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    for (const m of anchorMarkers.current) m.remove();
    anchorMarkers.current = [];
    if (!ready || !map || !ml || !activePair || mode === "place" || mode === "guide") return;
    activePath.anchors.forEach((a, i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = anchorClass;
      el.dataset.smooth = String(!!activePath.curves[i]);
      el.dataset.selected = String(i === anchorIdx);
      el.setAttribute("aria-label", `${i + 1}`);
      el.title = eraser ? t`クリックでこの点を削除` : t`ドラッグで移動。クリックで選択、ダブルクリックで曲線と角を切り替えます。`;
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        actions.current.clickAnchor(i);
      });
      el.addEventListener("dblclick", (event) => {
        event.stopPropagation();
        event.preventDefault();
        actions.current.toggleAnchor(i);
      });
      const marker = new ml.Marker({ element: el, draggable: !eraser }).setLngLat([a[1], a[0]]).addTo(map);
      marker.on("drag", () => actions.current.previewAnchor(i, marker.getLngLat()));
      marker.on("dragend", () => actions.current.dropAnchor(i, marker.getLngLat()));
      anchorMarkers.current.push(marker);
    });
    return () => {
      for (const m of anchorMarkers.current) m.remove();
      anchorMarkers.current = [];
    };
  }, [ready, activePair, activePath, mode, anchorIdx, eraser, t]);

  // ---- the guide points of the chosen leg ------------------------------------------------------------------------
  // Shown whenever a leg is chosen (so the person knows they are there); moved and removed only with the guide tool.
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    for (const m of guideMarkers.current) m.remove();
    guideMarkers.current = [];
    if (!ready || !map || !ml || !activePair || mode === "place") return;
    (activeLeg?.via ?? []).forEach(([lng, lat], i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = guideClass;
      const no = i + 1;
      el.setAttribute("aria-label", t`ガイド点 ${no}`);
      el.title = mode === "guide" ? t`ドラッグで移動、クリックで削除します。` : t`ガイド点（ルート検索の経由ポイント）。「ガイド点」ツールで移動・削除できます。`;
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        actions.current.clickGuide(i);
      });
      const marker = new ml.Marker({ element: el, draggable: mode === "guide" }).setLngLat([lng, lat]).addTo(map);
      marker.on("dragend", () => actions.current.dropGuide(i, marker.getLngLat()));
      guideMarkers.current.push(marker);
    });
    return () => {
      for (const m of guideMarkers.current) m.remove();
      guideMarkers.current = [];
    };
  }, [ready, activePair, activeLeg, mode, t]);

  // ---- place markers ---------------------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!ready || !map || !ml) return;
    // Off the globe (a mistyped latitude) is left off the map: MapLibre refuses it. The form marks it to fix (draftProblems).
    const wanted = props.places.filter((p) => p.lat !== null && p.lng !== null && onGlobe(p));
    const keys = new Set(wanted.map((p) => p.key));
    for (const [key, entry] of markers.current) {
      if (!keys.has(key)) {
        entry.marker.remove();
        markers.current.delete(key);
      }
    }
    for (const p of wanted) {
      // The same pins visitors see. A pin is drawn from its number, kind, role and shape, so it is made again when one changes.
      const shape = `${p.number}|${p.stampable}|${p.stopBy}|${p.detached ?? false}|${p.role ?? ""}|${p.kind}|${p.name}`;
      let entry = markers.current.get(p.key);
      if (entry && entry.shape !== shape) {
        entry.marker.remove();
        markers.current.delete(p.key);
        entry = undefined;
      }
      if (!entry) {
        const el = createMarkerElement({
          order: p.stampable ? p.number : null,
          label: p.stampable ? `${p.number}. ${p.name}` : p.name,
          kind: "neutral",
          status: "open",
          sideTrip: p.stopBy,
          noStamp: !p.stampable,
          role: p.role,
          place: p.kind,
          onSelect: () => {},
        });
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          const forKey = pickingRef.current;
          if (forKey) {
            const target = latest.current.places.find((x) => x.key === p.key);
            // Only a saved waypoint that is not itself worshipped from elsewhere (the list offers the same).
            if (target && target.key !== forKey && target.id && !target.stampFromKey) latest.current.onPatchPlace(forKey, { stampSpotId: target.id });
            setPicking(null);
            return;
          }
          latest.current.onSelectPlace(p.key);
        });
        const marker = new ml.Marker({ element: el, anchor: p.stopBy ? "center" : "bottom", draggable: modeRef.current === "pan" || modeRef.current === "place" }).setLngLat([p.lng!, p.lat!]).addTo(map);
        marker.on("dragend", () => {
          const { lat, lng } = marker.getLngLat();
          latest.current.onMovePlace(p.key, lat, lng);
        });
        entry = { marker, el, shape };
        markers.current.set(p.key, entry);
      }
      entry.marker.setLngLat([p.lng!, p.lat!]);
      entry.el.dataset.published = String(p.published);
      entry.el.title = p.published ? t`${p.name}（公開中）` : p.name;
      entry.el.setAttribute("aria-pressed", String(p.key === props.selectedKey));
    }
  }, [props.places, props.selectedKey, ready, t]);

  // ---- 遥拝: a dashed link from a place to the waypoint it is worshipped from (where its stamp is pressed).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const byKey = new Map(props.places.map((p) => [p.key, p]));
    const features = props.places.flatMap((p) => {
      const to = p.stampFromKey ? byKey.get(p.stampFromKey) : undefined;
      if (p.lat === null || p.lng === null || !to || to.lat === null || to.lng === null) return [];
      return [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: [[p.lng, p.lat], [to.lng, to.lat]] } }];
    });
    const data = { type: "FeatureCollection" as const, features };
    const source = map.getSource(YOHAI_SOURCE) as { setData?: (d: unknown) => void } | undefined;
    if (source?.setData) source.setData(data);
    else {
      map.addSource(YOHAI_SOURCE, { type: "geojson", data });
      map.addLayer({ id: YOHAI_SOURCE, type: "line", source: YOHAI_SOURCE, layout: { "line-cap": "round" }, paint: { "line-color": "#4b4b4b", "line-width": 2.5, "line-dasharray": [1, 1.5] } });
    }
  }, [props.places, ready]);

  // Keys: V, P and L pick the tool; E toggles the eraser while drawing; Escape leaves drawing; Delete removes the chosen point
  // while drawing and otherwise the chosen waypoint.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target;
      if (el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      const key = e.key.toLowerCase();
      if (key === "v") actions.current.chooseTool("select");
      else if (key === "p") actions.current.chooseTool("place");
      else if (key === "l") actions.current.chooseTool("draw");
      else if (key === "g") actions.current.chooseTool("guide");
      else if (key === "e" && modeRef.current === "draw") actions.current.toggleEraser();
      else if (e.key === "Escape" && locatingRef.current) setLocating(null);
      else if (e.key === "Escape" && (modeRef.current === "draw" || modeRef.current === "guide")) actions.current.leaveDraw();
      else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        // With the guide tool a guide point is removed by clicking it: Delete never removes a waypoint then.
        if (modeRef.current === "guide") return;
        // A chosen point of the leg goes first; with none chosen, the chosen waypoint.
        if (modeRef.current === "draw" || actions.current.hasAnchor()) actions.current.removeChosenAnchor();
        else if (latest.current.selectedKey) latest.current.onRemovePlace(latest.current.selectedKey);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ---- toolbar actions -------------------------------------------------------------------------------------
  // Read through `latest`, not `props`: these run from a timeout right after a new line was set (GPX, connect, snap), and
  // the `props` of the render that started the timeout still hold the old line.
  function fit() {
    const map = mapRef.current;
    if (!map) return;
    const { line, places } = latest.current;
    const pts = [...line.map((p) => ({ lng: p[0], lat: p[1] })), ...places.flatMap((p) => (p.lat === null || p.lng === null ? [] : [{ lat: p.lat, lng: p.lng }]))];
    const b = boundsOf(pts);
    if (b) map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 400 });
  }

  function fitLeg(id: string | null) {
    const map = mapRef.current;
    const pair = pairs.find((p) => pairId(p) === id);
    if (!map || !pair) return;
    const leg = legOf(latest.current.legs, pair.from.key, pair.to.key);
    const b = boundsOf([...(leg?.points ?? []).map((p) => ({ lng: p[0], lat: p[1] })), { lat: pair.from.lat, lng: pair.from.lng }, { lat: pair.to.lat, lng: pair.to.lng }]);
    if (b) map.fitBounds(b, { padding: 80, maxZoom: 16, duration: 400 });
  }

  function pickLeg(id: string) {
    setActiveId(id || null);
    props.onSelectPlace(null);
    if (id) fitLeg(id);
  }

  function chooseBase(next: EditorBase) {
    const map = mapRef.current;
    if (!map) return;
    for (const [id, visibility] of Object.entries(editorBaseVisibility(next))) if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
    setBase(next);
  }

  function toggleTerrain() {
    const map = mapRef.current;
    if (!map || !map.getLayer(terrainLayerId)) return;
    const next = !terrain;
    map.setLayoutProperty(terrainLayerId, "visibility", next ? "visible" : "none");
    setTerrain(next);
  }

  async function readGpx(file: File | undefined) {
    if (!file) return;
    setNote(null);
    setWaypoints(null);
    if (file.size > 20_000_000) return setNote(t`ファイルが大きすぎます（20MBまで）。`);
    const parsed = parseGpx(await file.text());
    if (!parsed.ok) return setNote(t`GPXファイルを読み込めませんでした。トラック（ルート線）または名称付きの地点が含まれるファイルを選択してください。`);
    if (parsed.points.length >= 2) {
      props.onLine(simplify(parsed.points, MAX_POINTS));
      setTimeout(fit, 100);
      setNote(
        pairs.length >= 1
          ? t`GPXファイルを読み込み、経由地ごとの区間に分割しました（最初と最後の経由地の外側は除外されます）。形状を確認してから保存してください。`
          : t`GPXファイルを読み込みました。経由地を2か所以上配置すると、経由地ごとの区間に分割されます。`,
      );
    }
    if (parsed.waypoints.length > 0) {
      setWaypoints(parsed.waypoints);
      if (parsed.points.length < 2) setNote(t`GPXファイルにルート線（トラック）はありませんでした。名称付きの地点のみ見つかりました。`);
    }
  }

  /** Only the heights of a GPX track are taken, and put on the line as it is drawn. */
  async function heightsFromGpx(file: File | undefined) {
    if (!file) return;
    setNote(null);
    if (file.size > 20_000_000) return setNote(t`ファイルが大きすぎます（20MBまで）。`);
    const parsed = parseGpx(await file.text());
    if (!parsed.ok || parsed.points.length < 2) return setNote(t`GPXファイルを読み込めませんでした。トラック（ルート線）が含まれるファイルを選択してください。`);
    const r = applyGpxElevations(props.line, parsed.points);
    if (!r) return setNote(t`このGPXファイルには標高データ付きのトラックがないか、現在のルート線とほとんど一致していません。`);
    props.onHeights(r.points);
    const total = props.line.length;
    const matched = r.matched;
    setNote(t`標高データを取り込みました。全${total}点のうち${matched}点がGPXのトラックと一致しました（その他の点は前後の標高から補完しています）。ルートの形状は変更していません。保存してください。`);
  }


  // ---- lines that make themselves (2026-11-20, user) ----------------------------------------------------------------
  // A walked leg (`auto`) follows the trails by itself as soon as both its stops are there, and again when one of them moves; a
  // ridden one (ferry, bus ...) is a straight hop. A leg kept as drawn (by hand, from a GPX file, or saved before 2026-11-20)
  // is left alone, and so are the ways back. GSI's own trail map is used (no key, no allowance), through the leg's guide points when it has some. The result is
  // folded into the change that caused it, so one undo takes back the stop and its line.
  const autoBusy = useRef(false);
  // The stops as they were when the map opened: a leg with no line is routed only once the stops changed in this session, so
  // opening a course never changes it (or cancels its line check) by itself.
  const stopsAtOpen = useRef<string | null>(null);
  const stopsNow = pairs.map((p) => `${p.from.key}:${p.from.lat},${p.from.lng}>${p.to.key}:${p.to.lat},${p.to.lng}`).join("|");
  useEffect(() => {
    if (ready && stopsAtOpen.current === null) stopsAtOpen.current = stopsNow;
  }, [ready, stopsNow]);
  useEffect(() => {
    if (!ready || autoBusy.current || stopsAtOpen.current === null) return;
    const changed = stopsNow !== stopsAtOpen.current;
    const todo = pairs.filter((pair) => {
      if (pair.back) return false;
      const leg = legOf(props.legs, pair.from.key, pair.to.key);
      return leg ? !!leg.stale && !!leg.auto : changed;
    });
    if (todo.length === 0) return;
    const timer = setTimeout(() => {
      autoBusy.current = true;
      setWorking(true);
      void (async () => {
        const built: Leg[] = [];
        for (const pair of todo) {
          const { from, to } = pair;
          const leg = legOf(props.legs, from.key, to.key);
          const keep = { ...(leg?.ride ? { ride: leg.ride } : {}), ...(leg?.via ? { via: leg.via } : {}), ...(pair.side ? { side: true as const } : {}) };
          if (leg?.ride) {
            built.push({ from: from.key, to: to.key, points: [[from.lng, from.lat], [to.lng, to.lat]], ...keep });
            continue;
          }
          const through = [{ lat: from.lat, lng: from.lng }, ...(leg?.via ?? []).map(([lng, lat]) => ({ lat, lng })), { lat: to.lat, lng: to.lng }];
          const r = await buildLine(through, "trail");
          built.push({ from: from.key, to: to.key, points: withEnds(simplify(roundLine(r.line), MAX_POINTS), from, to), ...keep, auto: true });
        }
        // Into the legs as they are now: one drawn by hand while this ran stays as drawn.
        latest.current.onAutoLegs(withAutoLegs(latest.current.legs, built));
        autoBusy.current = false;
        setWorking(false);
      })();
    }, 500);
    return () => clearTimeout(timer);
  }, [ready, pairs, props.legs, stopsNow]);

  function clearLine() {
    if (activePair) props.onClearLeg(activePair.from.key, activePair.to.key);
    else props.onClearLegs();
    setAnchorIdx(null);
  }

  async function runSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setFound(null);
    const hits = await searchPlaces(query);
    setSearching(false);
    if (hits === null) return setNote(t`地名検索サービスに接続できませんでした。しばらくしてからもう一度お試しください。`);
    if (hits.length === 0) return setNote(t`該当する場所が見つかりませんでした。`);
    setNote(null);
    setFound(hits);
  }

  function showHit(hit: PlaceHit) {
    mapRef.current?.flyTo({ center: [hit.lng, hit.lat], zoom: 15, duration: 600 });
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // the same file can be chosen again
    void readGpx(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDropping(false);
    void readGpx(e.dataTransfer.files[0]);
  }

  function addWaypoints() {
    if (!waypoints) return;
    props.onAddPlaces(waypoints.map((w) => ({ key: crypto.randomUUID(), name: w.name, lat: w.lat, lng: w.lng })));
    setNote(t`${waypoints.length}か所を経由地として追加しました。名称や種類は「経由地」タブで編集できます。`);
    setWaypoints(null);
  }

  const toolButton = (tool: "select" | "place" | "draw" | "guide", label: string, shortcut: string, icon: ReactNode) => {
    const pressed = tool === "select" ? mode === "pan" : mode === tool;
    return (
      <button
        key={tool}
        type="button"
        aria-pressed={pressed}
        aria-keyshortcuts={shortcut}
        title={`${label} (${shortcut})`}
        onClick={() => actions.current.chooseTool(tool)}
        className={`${iconBtn} justify-start px-1.5 text-xs sm:px-2 sm:text-sm ${pressed ? "bg-ink text-paper hover:bg-ink" : "text-ink"}`}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  };

  const legLabel = (pair: { from: Stop; to: Stop; side?: true; back?: true }) => `${pair.side ? t`【サブコース】` : pair.back ? t`【戻り】` : ""}${nameOf.get(pair.from.key) ?? ""} → ${nameOf.get(pair.to.key) ?? ""}`;
  const rideName: Record<RideMode, string> = { ferry: t`船`, bus: t`バス`, train: t`電車`, other: t`その他` };
  /** Ride (a ferry from a port ...) for this long: a straight hop between the two stops. */
  function setRide(mode: RideMode, minutes: number) {
    if (!activePair) return;
    const { from, to } = activePair;
    const base: Leg = { ...(activeLeg ?? { from: from.key, to: to.key, points: [] }), auto: undefined, stale: undefined }; // (an undefined member is not saved)
    setLeg({ ...base, points: [[from.lng, from.lat], [to.lng, to.lat]], ride: { mode, minutes: Math.min(1440, Math.max(1, Math.round(minutes))) } });
  }
  /**
   * What the chosen leg is (2026-11-20, user): 歩く follows the trails by itself, a ride is a straight hop, 手描き turns the
   * line it has into points to drag at once (the draw tool opens on it) and is never routed again on its own.
   */
  function setKind(kind: RideMode | "walk" | "hand") {
    if (!activePair) return;
    const { from, to } = activePair;
    if (kind === "walk") {
      const base: Leg = { ...(activeLeg ?? { from: from.key, to: to.key, points: [] }), ride: undefined };
      setLeg({ ...base, points: base.points.length >= 2 ? base.points : [[from.lng, from.lat], [to.lng, to.lat]], auto: true, stale: true });
    } else if (kind === "hand") {
      const base: Leg = { ...(activeLeg ?? { from: from.key, to: to.key, points: [[from.lng, from.lat], [to.lng, to.lat]] }), ride: undefined, stale: undefined, auto: undefined };
      setLeg(base);
      setMode("draw");
    } else setRide(kind, activeLeg?.ride?.minutes ?? 20);
  }
  // How long the leg takes to walk (from its line, and its climb once the heights are filled in): " · 25 min (1.2 km)".
  const timeText = (pair: { from: Stop; to: Stop }) => {
    const leg = legOf(props.legs, pair.from.key, pair.to.key);
    if (leg?.ride) {
      const [mode, minutes] = [rideName[leg.ride.mode], leg.ride.minutes];
      return ` · ${t`${mode} ${minutes}分`}`;
    }
    const time = leg ? legTime(leg.points) : null;
    if (!time) return "";
    const [minutes, km] = [time.minutes, time.km];
    return ` · ${t`${minutes}分（${km} km）`}`;
  };
  const activeName = activePair ? legLabel(activePair) + timeText(activePair) : null;
  // A saved line that the waypoints do not follow (a stop twice, or in another order) is kept as it is, not cut into legs.
  const looseLine = props.legs.length === 0 && props.line.length >= 2 && pairs.length > 0;
  const legName = activeName ?? "";
  const chosenNo = (anchorIdx ?? 0) + 1;
  const pointCount = activePath.anchors.length;
  const guideCount = activeLeg?.via?.length ?? 0;

  // What to do next, depending on the tool and on what is already on the map.
  const hasLine = props.line.length >= 2;
  const hasPlaces = props.places.length > 0;
  const selectedSide = props.places.some((p) => p.key === props.selectedKey && p.stopBy);
  const afterName = insertAfter ? (nameOf.get(insertAfter) ?? "") : "";
  const locatingName = locating ? nameOf.get(locating) ?? "" : "";
  const hint = locating
    ? t`地図をクリックして「${locatingName}」の位置を指定してください。キャンセルするには、もう一度ボタンを押すか Esc キーを押します。`
    : looseLine
    ? t`このルート線は経由地の順番や位置と一致しないため、区間分割されていません。経由地を修正して「区間に分割」を押すか、各区間を描き直してください（「元に戻す」で戻せます）。`
    : mode === "place"
      ? insertAfter
        ? t`地図をクリックすると、「${afterName}」の直後に経由地を追加します。`
        : t`地図をクリックして、経由地を追加します。`
      : mode === "guide"
        ? !activePair
          ? t`ガイド点を配置する区間（経由地間）を選択してください。`
          : t`地図をクリックして目印（ガイド点）を配置します（利用者には非表示）。ドラッグで移動、クリックで削除し、最後に「ルートを検索」を押してください。`
      : mode === "draw"
        ? !activePair
          ? t`描画する区間（経由地間）を選択してください。`
          : eraser
            ? t`削除したい点をクリックしてください。`
            : anchorIdx !== null
              ? t`新しい点は選択中の点（${chosenNo}番）の次に追加されます。もう一度クリックすると選択を解除できます。`
              : t`地図をクリックして点を追加します。ドラッグで移動、ダブルクリックで曲線と角を切り替えられます。`
        : selectedSide && activePair
          ? t`寄り道を選択中です。サブコースのルート（${legName}）は、一覧の「サブコースの線を描く」または「線を描く」ツールで描画できます。`
        : activePair
          ? t`「${legName}」を選択中です。点をドラッグしてルートを調整できます。地図の空白部分をクリックすると選択を解除できます。`
          : hasLine
            ? t`ルート線をクリックすると区間を選択できます。ピンをドラッグすると経由地を移動できます。`
            : hasPlaces
              ? t`ピンをドラッグすると経由地を移動できます。経由地間のルートは自動で生成され、線をクリックすると移動手段や手描きに変更できます。`
              : t`GPXファイルをここにドロップするか、「GPXを読み込む」から取り込んでください。手動で作成する場合は「経由地を追加」で地点を置き、「線を描く」でルートを描画します。`;

  return (
    // The map takes the full width; the waypoint list follows under it (beside it, both were cramped; user, 2026-11-17).
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t`ルート操作`}>
        {/* One button for the GPX file; its arrow offers the other thing to do with one (take only the heights). */}
        <div className="relative inline-flex">
          <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex h-11 min-h-0 min-w-0 items-center justify-center rounded-l-lg border border-line bg-ink px-3 text-sm font-bold text-paper">
            {t`GPXを読み込む`}
          </button>
          <button
            type="button"
            aria-label={t`GPXの読み込みオプション`}
            aria-haspopup="menu"
            aria-expanded={gpxMenu}
            onClick={() => setGpxMenu((v) => !v)}
            className="inline-flex h-11 min-h-0 min-w-0 items-center justify-center rounded-r-lg border border-l-paper/40 border-ink bg-ink px-2 text-sm font-bold text-paper"
          >
            <ChevronDownIcon size={18} />
          </button>
          {gpxMenu ? (
            <div role="menu" className="absolute left-0 top-full z-30 mt-1 flex min-w-64 flex-col rounded-full border border-line bg-paper p-1 shadow-lg">
              <button type="button" role="menuitem" onClick={() => { setGpxMenu(false); fileInput.current?.click(); }} className="rounded-md px-3 py-2 text-left text-sm font-bold hover:bg-surface">
                {t`ルートと標高を読み込む`}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={!hasLine}
                onClick={() => { setGpxMenu(false); heightsInput.current?.click(); }}
                className="rounded-md px-3 py-2 text-left text-sm font-bold hover:bg-surface disabled:opacity-50"
                title={t`GPXファイルから標高データのみを取り込み、現在のルートに反映します（ルートの形状は変わりません）`}
              >
                {t`標高のみ取り込む（ルートは維持）`}
              </button>
            </div>
          ) : null}
        </div>
        <input ref={fileInput} type="file" accept=".gpx,application/gpx+xml,text/xml,application/xml" onChange={onFile} className="sr-only" tabIndex={-1} aria-hidden="true" />
        <span className="text-sm text-muted">{working ? t`ルートを検索しています…` : t`経由地間のルートは自動で生成されます。`}</span>
        <div className="flex basis-full flex-wrap gap-2 empty:hidden">
        <input
          ref={heightsInput}
          type="file"
          accept=".gpx,application/gpx+xml,text/xml,application/xml"
          onChange={(e) => {
            void heightsFromGpx(e.target.files?.[0]);
            e.target.value = "";
          }}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
        {looseLine ? (
          <button type="button" onClick={props.onSplitLine} className={`${chipClass} w-full`} title={t`現在のルート線を経由地の順に区間分割します（経由地が線と離れている場合は直線になります）`}>
            {t`区間に分割`}
          </button>
        ) : null}
        </div>
      </div>


      <div className="relative">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch();
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <label htmlFor="map-search" className="sr-only">
          {t`地名・スポット名で検索`}
        </label>
        <input
          id="map-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t`地名・スポット名で検索`}
          className="tap-target min-w-0 basis-40 flex-1 rounded-full border border-line bg-paper px-4 text-lg"
        />
        <button type="submit" disabled={searching || !query.trim()} className={`${toolClass} border-line bg-paper`}>
          {searching ? t`検索中…` : t`検索`}
        </button>
      </form>
      {found ? (
        <ul aria-label={t`検索結果`} className="absolute left-0 right-0 top-full z-30 mt-1 flex max-h-80 flex-col gap-1 overflow-y-auto rounded-xl border border-line bg-paper p-2 shadow-xl">
          {found.map((h, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 p-1">
              <span className="min-w-0 flex-1 break-words text-base">{h.name}</span>
              <button type="button" onClick={() => showHit(h)} className={`${toolClass} border-line bg-paper`}>
                {t`地図で表示`}
              </button>
              <button type="button" onClick={() => props.onAddPlace(h.lat, h.lng)} className={`${toolClass} border-line bg-paper`}>
                {t`ここに経由地を追加`}
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={() => setFound(null)} className="tap-target px-2 text-base font-bold underline underline-offset-4">
              {t`閉じる`}
            </button>
          </li>
        </ul>
      ) : null}
      </div>

      <p className="line-clamp-2 min-h-[2.5rem] text-sm text-muted" aria-live="polite" title={note ?? hint}>
        {note ?? hint}
      </p>


      {/* The map fills the screen's height; on a wide screen the list (or the course's box) floats over its right side, and
          what used to appear above the map (the chosen leg, the GPX points) floats on it, so nothing pushes the page
          (2026-11-20, user). On a narrow screen the panel follows under the map. */}
      <div className="relative">
      <div
        className="relative h-[calc(100dvh-14rem)] min-h-[34rem] overflow-hidden rounded-2xl bg-surface"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDropping(true);
          }
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={onDrop}
      >
        <div ref={container} className="h-full w-full" />
        <div className="absolute left-3 top-3 flex flex-col items-start gap-2">
          <div role="toolbar" aria-label={t`地図ツール`} className={`${floatClass} grid max-w-[calc(100%-4.5rem)] grid-cols-[repeat(2,max-content)] sm:flex sm:flex-wrap`}>
            {toolButton("select", t`選択・移動`, "V", <CursorIcon />)}
            {toolButton("place", t`経由地を追加`, "P", <PinIcon />)}
            {toolButton("draw", t`線を描く`, "L", <PencilIcon />)}
            {toolButton("guide", t`ガイド点`, "G", <GuideIcon />)}
          </div>
          {mode === "draw" || mode === "guide" ? (
            <div role="group" aria-label={mode === "guide" ? t`ガイド点を追加` : t`区間を描く`} className={`${floatClass} max-w-[calc(100vw-6rem)] flex-wrap`}>
              <label htmlFor="leg-pick" className="sr-only">
                {t`描く区間`}
              </label>
              <select id="leg-pick" value={activeId ?? ""} onChange={(e) => pickLeg(e.target.value)} className="h-11 min-h-0 max-w-64 truncate rounded-full border border-line bg-paper px-2 text-sm font-bold">
                <option value="">{t`区間を選択`}</option>
                {pairs.map((pair) => (
                  <option key={pairId(pair)} value={pairId(pair)}>
                    {`${legOf(props.legs, pair.from.key, pair.to.key) ? "● " : "○ "}${legLabel(pair)}${timeText(pair)}`}
                  </option>
                ))}
              </select>
              {activePair && mode === "guide" ? (
                <>
                  <span className="px-1 text-sm tabular-nums">{t`ガイド点 ${guideCount}`}</span>
                  <button type="button" disabled={working || guideCount === 0} onClick={() => void routeThroughGuides(activeLeg?.via ?? [])} className={`${iconBtn} bg-ink text-paper hover:bg-ink`} title={t`現在のガイド点を通るルートを検索します）`}>
                    {working ? t`検索中…` : t`ルートを検索`}
                  </button>
                  <button type="button" disabled={working || guideCount === 0} onClick={() => changeGuides([])} className={`${iconBtn} text-danger`} title={t`ガイド点をすべて削除します（ルート線は維持されます）`}>
                    {t`すべて削除`}
                  </button>
                  <button type="button" onClick={() => fitLeg(activeId)} className={iconBtn} title={t`この区間を表示`} aria-label={t`この区間を表示`}>
                    <FitIcon />
                  </button>
                </>
              ) : null}
              {activePair && mode === "draw" ? (
                <>
                  <div className="flex items-center rounded-lg bg-surface p-0.5" role="group" aria-label={t`点の編集`}>
                    <button type="button" aria-pressed={!eraser} onClick={() => setEraser(false)} className={`${iconBtn} ${!eraser ? "bg-paper shadow-sm" : "text-muted"}`}>
                      {t`点を追加`}
                    </button>
                    <button type="button" aria-pressed={eraser} aria-keyshortcuts="E" title={t`点を削除 (E)`} onClick={() => setEraser(true)} className={`${iconBtn} ${eraser ? "bg-paper text-danger shadow-sm" : "text-muted"}`}>
                      {t`点を削除`}
                    </button>
                  </div>
                  <button
                    type="button"
                    aria-pressed={isAllSmooth(activePath.curves)}
                    onClick={() => editPath((p) => setAllCurves(p, !isAllSmooth(p.curves)))}
                    disabled={activePath.anchors.length === 0}
                    title={t`すべての点を滑らかな曲線にします（もう一度押すと角に戻ります）`}
                    className={`${iconBtn} ${isAllSmooth(activePath.curves) ? "bg-ink text-paper hover:bg-ink" : ""}`}
                  >
                    {t`すべて曲線にする`}
                  </button>
                  <span className="px-1 text-sm tabular-nums">{t`点 ${pointCount}`}</span>
                  <button type="button" onClick={() => fitLeg(activeId)} className={iconBtn} title={t`この区間を表示`} aria-label={t`この区間を表示`}>
                    <FitIcon />
                  </button>
                </>
              ) : null}
              <button type="button" onClick={() => actions.current.leaveDraw()} className={`${iconBtn} bg-ink text-paper hover:bg-ink`}>
                {t`完了`}
              </button>
            </div>
          ) : null}
        </div>
        <div className="absolute bottom-8 left-3 flex flex-wrap gap-2">
          <div className={floatClass} role="group" aria-label={t`編集操作`}>
            <button type="button" disabled={!props.canUndo} onClick={props.onUndo} className={iconBtn} title={t`元に戻す`} aria-label={t`元に戻す`}>
              <UndoIcon />
            </button>
            <button type="button" disabled={!props.canRedo} onClick={props.onRedo} className={iconBtn} title={t`やり直す`} aria-label={t`やり直す`}>
              <RedoIcon />
            </button>
            <button type="button" disabled={props.line.length === 0 && !activeLeg} onClick={clearLine} className={`${iconBtn} text-danger`} title={activePair ? t`選択中の区間の線を削除` : t`線をすべて削除`} aria-label={activePair ? t`選択中の区間の線を削除` : t`線をすべて削除`}>
              <TrashIcon />
            </button>
          </div>
          <div className={floatClass} role="group" aria-label={t`地図の種類`}>
            {editorBases.map((b) => (
              <button key={b} type="button" aria-pressed={base === b} onClick={() => chooseBase(b)} className={`${iconBtn} ${base === b ? "bg-ink text-paper hover:bg-ink" : ""}`}>
                {b === "std" ? t`標準` : b === "pale" ? t`淡色` : b === "photo" ? t`写真` : t`アウトドア`}
              </button>
            ))}
          </div>
          <div className={floatClass} role="group" aria-label={t`表示操作`}>
            <button type="button" onClick={() => mapRef.current?.zoomIn()} className={`${iconBtn} text-xl`} title={t`拡大`} aria-label={t`拡大`}>
              ＋
            </button>
            <button type="button" onClick={() => mapRef.current?.zoomOut()} className={`${iconBtn} text-xl`} title={t`縮小`} aria-label={t`縮小`}>
              －
            </button>
            <button type="button" onClick={fit} className={iconBtn} title={t`全体を表示`} aria-label={t`全体を表示`}>
              <FitIcon />
            </button>
            <button type="button" aria-pressed={terrain} onClick={toggleTerrain} className={`${iconBtn} ${terrain ? "bg-ink text-paper hover:bg-ink" : ""}`} title={t`地形の陰影`} aria-label={t`地形の陰影`}>
              <TerrainIcon />
            </button>
          </div>
        </div>
        {dropping ? <p className="absolute inset-0 flex items-center justify-center bg-paper/80 text-xl font-bold">{t`GPXファイルをここにドロップして読み込み`}</p> : null}
        {!ready ? <p className="absolute inset-0 flex items-center justify-center text-lg">{t`地図を読み込み中…`}</p> : null}
        {activePair ? (
          <div role="group" aria-label={t`選択中の区間`} className="absolute bottom-[5.5rem] left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-xl border border-line bg-paper/95 px-3 py-2 shadow-lg lg:max-w-[calc(100%-29rem)]">
            <span className="min-w-0 flex-1 basis-60 truncate text-sm font-bold" title={legName} aria-live="polite">
              {t`選択中：${legName}`}
            </span>
            {activePair && !activePair.side ? (
            <span className="flex items-center gap-1" role="group" aria-label={t`移動手段`}>
              <select
                aria-label={t`区間の種類`}
                value={activeLeg?.ride ? activeLeg.ride.mode : !activeLeg || activeLeg.auto ? "walk" : "hand"}
                onChange={(e) => setKind(e.target.value as RideMode | "walk" | "hand")}
                className="h-11 min-h-0 rounded-full border border-line bg-paper px-2 text-sm font-bold"
              >
                <option value="walk">{t`徒歩（自動ルート）`}</option>
                {RIDE_MODES.map((m) => (
                  <option key={m} value={m}>
                    {rideName[m]}
                  </option>
                ))}
                <option value="hand">{t`手描き`}</option>
              </select>
              {activeLeg?.ride ? (
                <>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    aria-label={t`所要時間（分）`}
                    value={activeLeg.ride.minutes}
                    onChange={(e) => setRide(activeLeg.ride!.mode, Number(e.target.value) || 1)}
                    className="h-11 min-h-0 w-20 rounded-full border border-line bg-paper px-2 text-sm font-bold"
                  />
                  <span className="text-sm">{t`分`}</span>
                </>
              ) : null}
            </span>
          ) : null}
            <button type="button" onClick={() => setActiveId(null)} className={chipClass} title={t`区間の選択を解除します`}>
              {t`選択を解除`}
            </button>
          </div>
        ) : null}
        {waypoints ? (
          <div role="group" aria-label={t`GPXの地点データ`} className="absolute left-1/2 top-20 z-20 flex w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 flex-col gap-3 rounded-xl border border-line bg-paper p-4 shadow-xl">
            <p className="text-lg font-bold">{t`名称付きの地点が${waypoints.length}か所見つかりました。経由地として追加しますか？`}</p>
            <ul className="max-h-40 list-disc overflow-auto pl-6 text-base">
              {waypoints.map((w, i) => (
                <li key={i}>{w.name || t`（名称未設定）`}</li>
              ))}
            </ul>
            <p className="text-base text-muted">{t`追加した地点は「位置未確認」の状態になります。公開前に公式情報で位置を確認してください。`}</p>
            <div className="flex gap-2">
              <button type="button" onClick={addWaypoints} className="tap-target rounded-full bg-ink px-6 text-lg font-bold text-paper">
                {t`追加する`}
              </button>
              <button type="button" onClick={() => setWaypoints(null)} className="tap-target rounded-full border border-line px-6 text-lg font-bold">
                {t`追加しない`}
              </button>
            </div>
          </div>
        ) : null}
        {!panelOpen ? (
          <button type="button" onClick={() => setPanelOpen(true)} className={`${floatClass} absolute right-3 top-3 z-10 hidden px-3 text-sm font-bold lg:flex`}>
            {t`パネルを開く`}
          </button>
        ) : null}
      </div>
      {panelOpen ? (
        <aside aria-label={t`経由地とコースの範囲`} className="mt-3 flex flex-col rounded-2xl border border-line bg-paper lg:absolute lg:bottom-3 lg:right-3 lg:top-3 lg:z-10 lg:mt-0 lg:w-[26rem] lg:bg-paper/95 lg:shadow-xl">
          <div className="flex items-center gap-2 border-b border-line p-2">
            <div role="tablist" aria-label={t`パネル切り替え`} className="flex flex-1 rounded-full bg-surface p-1">
              <button type="button" role="tab" aria-selected={panel === "places"} onClick={() => setPanel("places")} className={`min-h-10 flex-1 rounded-full px-3 text-sm font-bold ${panel === "places" ? "bg-paper shadow-sm" : "text-muted"}`}>
                {t`経由地`}
              </button>
              {props.area ? (
                <button type="button" role="tab" aria-selected={panel === "area"} onClick={() => setPanel("area")} className={`min-h-10 flex-1 rounded-full px-3 text-sm font-bold ${panel === "area" ? "bg-paper shadow-sm" : "text-muted"}`}>
                  {t`コースの範囲`}
                </button>
              ) : null}
            </div>
            <button type="button" onClick={() => setPanelOpen(false)} className={`${iconBtn} hidden lg:inline-flex`} title={t`パネルを閉じる`} aria-label={t`パネルを閉じる`}>
              <XIcon size={20} />
            </button>
          </div>
          {/* relative: hidden screen-reader text (sr-only, absolute) deep in a long list is clipped here; without it it stretched the page (2026-11-27). */}
          <div className="relative min-h-0 flex-1 overflow-y-auto p-3">
            {panel === "area" && props.area ? (
              <CourseAreaEditor
                area={props.area.value}
                line={props.line}
                places={props.places.flatMap((p) => (p.lat !== null && p.lng !== null ? [{ lat: p.lat, lng: p.lng }] : []))}
                onChange={props.area.onChange}
                onMap={onMap}
              />
            ) : props.places.length > 0 ? (
<PlaceList
                  {...props}
                  insertAfter={insertAfter}
                  back={{
                    legs: pairs.filter((p) => p.back).map((p) => ({ from: p.from.key, to: p.to.key })),
                    activeIndex: pairs.filter((p) => p.back).findIndex((p) => pairId(p) === activeId),
                    options: backChoices(stops, props.legs).options.map((st) => st.key),
                    onAdd: (toKey) => {
                      const { end, options } = backChoices(stops, props.legs);
                      const to = options.find((st) => st.key === toKey);
                      if (!end || !to) return;
                      setLeg(backLeg(end, to, stops, props.legs));
                      setActiveId(pairId({ from: end, to, back: true }));
                      setAfterOff(false);
                      setNote(null);
                      setMode("draw");
                    },
                    onRemoveLast: () => {
                      const last = pairs.filter((p) => p.back).at(-1);
                      if (last) props.onClearLeg(last.from.key, last.to.key);
                    },
                    onDraw: (index) => {
                      const pair = pairs.filter((p) => p.back)[index];
                      if (!pair) return;
                      // A return leg still straight (made before it followed the route, or nothing drawn yet) starts on the route's own way back.
                      if (isStraightBack(legOf(props.legs, pair.from.key, pair.to.key))) setLeg(backLeg(pair.from, pair.to, stops, props.legs));
                      setActiveId(pairId(pair));
                      setAfterOff(false);
                      setNote(null);
                      setMode("draw");
                    },
                  }}
                  onDrawSubCourse={(key) => {
                    props.onSelectPlace(key);
                    setActiveId(key); // a side trip's leg is named by the place it runs to
                    setAfterOff(false);
                    setNote(null);
                    setMode("draw");
                  }}
                  locating={locating}
                  onLocate={(key) => setLocating((cur) => (cur === key ? null : key))}
                  picking={picking}
                  onPick={(key) => setPicking((cur) => (cur === key ? null : key))}
                  onInsertAfter={(key) => {
                    if (insertAfter === key) return setAfterOff(true);
                    props.onSelectPlace(key);
                    actions.current.chooseTool("place");
                  }}
                />
            ) : (
              <p className="text-base text-muted">{t`経由地がまだありません。「経由地を追加」ツールで地図上に配置できます。`}</p>
            )}
          </div>
        </aside>
      ) : null}
      </div>

      <p className="text-lg font-bold tabular-nums">
        {props.line.length >= 2 ? t`総距離 ${props.distanceKm ?? 0} km` : t`ルート線がまだありません。`}
        {props.climbM !== null && props.line.length >= 2 ? <span className="ml-4">{t`登り ${props.climbM} m`}</span> : null}
        {props.elevationStatus === "loading" ? <span className="ml-4 text-base font-normal text-muted">{t`標高を取得中…`}</span> : null}
        {props.elevationStatus === "partial" ? <span className="ml-4 text-base font-normal text-muted">{t`一部の地点で標高を取得できませんでした。`}</span> : null}
      </p>

      </div>

    </div>
  );
}
