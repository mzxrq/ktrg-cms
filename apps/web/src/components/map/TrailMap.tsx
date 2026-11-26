"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { Map as MapLibreMap } from "maplibre-gl";
import { ChevronIcon, ChevronLeftIcon, CloseIcon, ExpandIcon, ListIcon, MinusIcon, PlayIcon, PlusIcon, StopIcon, WarningIcon } from "@/components/icons";
import { SampleNoticeButton } from "@/components/SampleNotice";
import { pinPhotoSrc } from "@/lib/pin-photo";
import type { MapPhoto } from "@/lib/map-screen";
import type { SpotStatus } from "@/lib/content";
import {
  boundsOf,
  gsiAttribution,
  lineFeature,
  markerKind,
  nextStopId,
  pinScale, PIN_NUMBER_MIN_ZOOM,
  routeLineLayers,
  sideLineCollection,
  sideLineLayers,
  terrainLayerId,
  zoomLimits,
  type Position,
} from "@/lib/map";
import { mapStyleSource } from "@/lib/large-map-style";
import { GSI_DEM_SOURCE, registerGsiDem } from "@/lib/gsi-dem";
import { motionLevel } from "@/lib/motion";
import { setElevationCursor } from "@/lib/elevation-cursor";
import { flightPath, flightSeconds, flightStops, headingAt, heightAt, pointAt, turnToward, type FlyStop } from "@/lib/fly-along";
import type { MapSettings } from "@/lib/map-settings";
import type { StopRole } from "@/lib/route-stops";
import type { PointKind } from "@/lib/point-kinds";
import { groupCounts, groupOf, sortByDistance, type Coord, type MapPlace, type PlaceGroup } from "@/lib/places";
import { createMarkerElement, createPlaceMarkerElement } from "./MapMarker";
import { useCursorMarker } from "./useCursorMarker";
import { PlaceCard, PlaceChips, PlaceList, TickBadge, filterPill } from "./PlacesPanel";
import { StopCard } from "./StopCard";
import { FlyCard } from "./FlyCard";

export interface MapStop {
  id: string;
  /** 1, 2, 3 ... in walking order, stamp places only; the number shown on the marker. null for a side trip and a place without a stamp. */
  order: number | null;
  name: string;
  /** The spoken name of the marker, for example "3. 猿坂峠, stamped". */
  label: string;
  nameLang: "ja" | "en";
  position: { lat: number; lng: number };
  /** null when signed out. */
  stamped: boolean | null;
  status: SpotStatus;
  /** The spot page, already with the locale. */
  href: string;
  /** An optional visit beside the way (寄り道): its pin has no number, and its line is thin, dashed and blue. */
  sideTrip?: boolean;
  /** A place where no stamp can be collected (a toilet, a station ...): a square pin, never "next to stamp". */
  noStamp?: boolean;
  /** Where the walk starts and ends: the pin takes the Start (blue), Goal (orange) or both colours. */
  role?: StopRole;
  /** What the place is, shown as a small picture on the pin. */
  kind?: PointKind;
  /** The place's own uploaded photo: the pin's head shows it (see lib/pin-photo.ts). */
  photo?: MapPhoto | null;
  /** The fly-along stops here and shows this (lib/fly-along.ts flyStopOf); left out when it flies past. */
  fly?: FlyStop;
}

type Selection = { kind: "stop" | "place"; id: string } | null;

const LINE_SOURCE = "route";
const SIDE_SOURCE = "route-side";
const DEM_SOURCE = "gsi-dem";
// A constant, not `[]` in the parameter list: a new array each render would rebuild the map each render.
const NO_SIDE_LINES: Position[][] = [];
// Keep every stop clear of the buttons: zoom buttons at the top right, the chip at the top left,
// the "bigger" button and the credit line along the bottom.
const FIT = { padding: { top: 76, bottom: 112, left: 56, right: 92 }, maxZoom: 16, animate: false } as const;
// The facilities list is not a layer, so it reads as a link beside the layer pills (a pill-shaped paper ground over the map, where bare text would sit on the tiles).
const listLink =
  "tap-target inline-flex items-center gap-2 px-1 text-lg font-bold text-ink underline underline-offset-4 @4xl:rounded-full @4xl:bg-paper/95 @4xl:px-3 @4xl:shadow-sm";
// On the enlarged map it always lies on the tiles, so it always has the pill ground.
const listLinkOverMap =
  "tap-target inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-paper/95 px-3 text-lg font-bold text-ink underline underline-offset-4 shadow-sm";
// Enlarged, the ✕ and pill row take the top and the stepper and credit the bottom (top-clear included roughly).
const FIT_EXPANDED = { ...FIT, padding: { top: 132, bottom: 150, left: 40, right: 72 } } as const;
const buttonClass =
  "tap-target inline-flex items-center justify-center gap-2 rounded-full border border-ink bg-paper px-3 text-lg font-bold text-ink hover:bg-surface";
// The small round controls laid over the map: a 48 px target (the older-reader rule) with a smaller circle drawn in it.
const hit = "tap-target inline-flex items-center justify-center disabled:opacity-40";
const disc = "flex size-9 items-center justify-center rounded-full border border-ink bg-paper/95 text-ink shadow-sm";

/**
 * The trail map (WBS 3.2.1, 3.2.2): GSI tiles, the route line, one numbered button per stop and, on
 * request, the places around (toilets, shops ...).
 * - Embedded, a finger on the map still scrolls the page (two fingers move the map; the zoom
 *   buttons always work); "bigger" opens it full screen with full pan and zoom.
 * - Markers that would overlap are merged into one group button; tapping it zooms in.
 * - `line` is the real path when the CMS has it; without it the stops are joined by dashed lines.
 */
export function TrailMap({
  stops,
  line,
  sideLines = NO_SIDE_LINES,
  places,
  draft,
  settings,
  placesFirst,
  lineElevations,
}: {
  stops: MapStop[];
  line: Position[] | null;
  /** The height of each point of `line` (as the elevation chart), for the fly-along's readout. */
  lineElevations?: (number | null)[] | null;
  /** Side trips (寄り道): thin dashed blue lines out to stop-by places. */
  sideLines?: Position[][];
  places: MapPlace[];
  draft: boolean;
  settings: MapSettings;
  /** The visitor's choice: show the nearby places from the start. */
  placesFirst: boolean;
}) {
  const { t, i18n } = useLingui();
  const sectionRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mlRef = useRef<typeof import("maplibre-gl") | null>(null);
  const buttonByKey = useRef(new Map<string, HTMLElement>());
  const expandRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [mapGen, setMapGen] = useState(0); // bumped each time a map is created
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [terrain, setTerrain] = useState(false);
  // The fly-along over the 3D map, and where it is (rounded, so the readout re-renders only when its words change).
  const [flying, setFlying] = useState(false);
  const [flightAt, setFlightAt] = useState<{ km: string; m: number | null } | null>(null);
  // The waypoint the fly-along is paused at (its card shows), and 次へ's wish to go on before its seconds are up.
  const [flyCardId, setFlyCardId] = useState<string | null>(null);
  const skipPause = useRef(false);
  // Side trips (寄り道) are off at first: some places are worth a mention without being a stop on the way.
  const [showSide, setShowSide] = useState(false);
  const hasSide = sideLines.some((l) => l.length >= 2);
  const [selected, setSelected] = useState<Selection>(null);
  // Every kind of place that exists on this course is on from the start when the visitor chose that.
  const [active, setActive] = useState<ReadonlySet<PlaceGroup>>(
    () => new Set(placesFirst ? (Object.keys(groupCounts(places)) as PlaceGroup[]) : []),
  );

  const counts = useMemo(() => groupCounts(places), [places]);
  const visiblePlaces = useMemo(() => places.filter((p) => active.has(groupOf(p.category))), [places, active]);
  const selectedStop = selected?.kind === "stop" ? stops.find((s) => s.id === selected.id) : undefined;
  const selectedPlace = selected?.kind === "place" ? places.find((p) => p.id === selected.id) : undefined;
  // Distances are measured from the chosen stop, or else from the start of the course.
  const origin: Coord | undefined = selectedStop?.position ?? stops[0]?.position;

  // Create the map once for these inputs; remove it again on unmount (CLAUDE.md: map.remove()).
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;

    (async () => {
      try {
        const ml = await import("maplibre-gl");
        if (cancelled || !containerRef.current) return;
        // A rebuilt map (the style settings changed) has not loaded its style yet, whatever the old one did.
        setLoaded(false);
        // MapLibre 6 runs its tile work in a separate worker file. Under Next.js the bundler must
        // emit that file, which this new URL(..., import.meta.url) pattern (from MapLibre's own
        // docs for Next.js 15 and later) does. Without it: "Worker failed to load".
        ml.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
        const stopPoints = stops.map((s) => s.position);
        const linePoints = line ?? stopPoints;
        const bounds = boundsOf([...stopPoints, ...linePoints]);
        map = new ml.Map({
          container: containerRef.current,
          style: mapStyleSource(settings, i18n.locale),
          bounds: bounds ?? undefined,
          fitBoundsOptions: FIT,
          minZoom: zoomLimits.min,
          maxZoom: zoomLimits.max,
          dragRotate: false,
          pitchWithRotate: false,
          // One finger scrolls the page, two fingers move the map: no trap on a long page.
          cooperativeGestures: true,
          locale: {
            "CooperativeGesturesHandler.MobileHelpText": t`2本の指で地図を動かします`,
            "CooperativeGesturesHandler.WindowsHelpText": t`Ctrlキーを押しながら地図を動かします`,
            "CooperativeGesturesHandler.MacHelpText": t`⌘キーを押しながら地図を動かします`,
          },
          attributionControl: { compact: false },
          // Without this the map prints as a blank box (the browser prints what the canvas still holds).
          canvasContextAttributes: { preserveDrawingBuffer: true },
        });
        map.touchZoomRotate.disableRotation();
        // A tile that cannot be fetched (weak signal) is normal, not an error to shout about: the
        // background shows and the tile is retried when the map moves.
        map.on("error", () => {});
        // The pins are smaller when zoomed out (the markers read this size from the map's own element).
        const sizePins = () => {
          containerRef.current?.style.setProperty("--pin", String(pinScale(map!.getZoom())));
          containerRef.current?.toggleAttribute("data-far", map!.getZoom() < PIN_NUMBER_MIN_ZOOM);
        };
        map.on("zoom", sizePins);
        sizePins();

        // Ready as soon as the style is: MapLibre's own "load" waits for every visible tile, which
        // on a weak mountain signal can take very long. The line, markers and buttons must not
        // wait for that; tiles simply fill in as they arrive. A single event can be missed, so
        // this is tried on every style update and on load, and runs only once.
        let started = false;
        const start = () => {
          if (started || cancelled || !map || !map.isStyleLoaded()) return;
          started = true;
          // Side trips first, so the route's own line is drawn over them.
          map.addSource(SIDE_SOURCE, { type: "geojson", data: sideLineCollection(sideLines) });
          for (const layer of sideLineLayers(SIDE_SOURCE)) map.addLayer(layer);
          map.addSource(LINE_SOURCE, { type: "geojson", data: lineFeature(linePoints) });
          for (const layer of routeLineLayers(LINE_SOURCE, line === null)) map.addLayer(layer);
          setLoaded(true);
        };
        map.on("styledata", start);
        map.on("load", start);
        start();

        mapRef.current = map;
        mlRef.current = ml;
        setMapGen((g) => g + 1);
      } catch {
        // No WebGL, or the library failed to load: the list on the page still works.
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
    // `t` changes only with the language, which reloads the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, line, sideLines, settings, i18n.locale]);

  useCursorMarker(mapRef, mlRef, mapGen);

  // Draw the markers: one button per stop and place, the same at every zoom.
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml) return;
    const live: { remove: () => void }[] = [];
    const buttons = buttonByKey.current;
    buttons.clear();
    const put = (el: HTMLElement, at: Coord, anchor: "center" | "bottom" = "center") =>
      live.push(new ml.Marker({ element: el, anchor }).setLngLat([at.lng, at.lat]).addTo(map));

    // Places first, so the numbered stops sit on top of them. Every place and stop is its own button, never merged into a
    // group (2026-11-11): a merged button gets in the way when moving the map. Pins on one spot overlap; the previous and
    // next buttons reach each of them.
    for (const place of visiblePlaces) {
      const el = createPlaceMarkerElement({
        group: groupOf(place.category),
        category: place.category,
        icon: place.icon,
        label: place.name,
        closed: place.status === "closed" || place.status === "gone",
        onSelect: () => setSelected({ kind: "place", id: place.id }),
      });
      buttons.set(`place:${place.id}`, el);
      put(el, place.position);
    }

    const next = nextStopId(stops);
    for (const stop of stops) {
      const el = createMarkerElement({
        order: stop.order,
        label: stop.label,
        kind: stop.noStamp ? "neutral" : markerKind(stop.stamped, stop.id === next),
        status: stop.status,
        sideTrip: stop.sideTrip,
        noStamp: stop.noStamp,
        role: stop.role,
        place: stop.kind,
        photo: pinPhotoSrc(stop.photo),
        stamped: stop.stamped === true,
        onSelect: () => setSelected({ kind: "stop", id: stop.id }),
      });
      buttons.set(`stop:${stop.id}`, el);
      put(el, stop.position, "bottom");
    }

    return () => {
      live.forEach((m) => m.remove());
      buttons.clear();
    };
  }, [mapGen, stops, visiblePlaces]);

  // Mark the selected marker for screen readers and for the highlighted look.
  useEffect(() => {
    buttonByKey.current.forEach((el, key) =>
      el.setAttribute("aria-pressed", String(selected !== null && key === `${selected.kind}:${selected.id}`)),
    );
  }, [selected, mapGen, stops, visiblePlaces]);

  // Embedded: a finger scrolls the page. Expanded: the whole screen is the map, so one finger moves it.
  // Either way the map is resized and fitted again once the layout has settled.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (expanded) map.cooperativeGestures.disable();
    else map.cooperativeGestures.enable();
    const timer = window.setTimeout(() => {
      map.resize();
      const bounds = boundsOf([
        ...stops.map((s) => s.position),
        ...(line ?? []),
        ...visiblePlaces.map((p) => p.position),
      ]);
      if (bounds) map.fitBounds(bounds, expanded ? FIT_EXPANDED : FIT);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [expanded, loaded, mapGen, stops, line, visiblePlaces]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    for (const id of [`${SIDE_SOURCE}-casing`, `${SIDE_SOURCE}-line`]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", showSide ? "visible" : "none");
    }
  }, [showSide, loaded, mapGen]);

  useEffect(() => {
    const map = mapRef.current;
    // Only on a map whose style has finished loading, and only if it has the overlay.
    if (map && loaded && map.isStyleLoaded() && map.getLayer(terrainLayerId)) {
      map.setLayoutProperty(terrainLayerId, "visibility", terrain ? "visible" : "none");
    }
  }, [terrain, loaded, mapGen]);

  // 3D (2026-11-26, user): on the enlarged map the terrain pill also raises the ground (GSI heights through lib/gsi-dem.ts,
  // as the /map page's 3D) under a tilted view, so the course line lies on the real slopes. Flat and north-up again when it
  // is turned off or the map closes (the visitor cannot rotate it back: dragRotate is off).
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!map || !ml || !loaded) return;
    const duration = motionLevel() === "full" ? 700 : 0;
    if (terrain && expanded) {
      registerGsiDem(ml);
      if (!map.getSource(DEM_SOURCE)) map.addSource(DEM_SOURCE, { ...GSI_DEM_SOURCE, attribution: gsiAttribution });
      map.setTerrain({ source: DEM_SOURCE, exaggeration: 1.5 });
      map.easeTo({ pitch: 60, duration });
    } else if (map.getTerrain()) {
      map.setTerrain(null);
      map.easeTo({ pitch: 0, bearing: 0, duration });
    }
  }, [terrain, expanded, loaded, mapGen]);

  // The fly-along (2026-11-26, user): the 3D camera follows the course from start to goal, looking ahead along it, with a dot
  // and a readout of the distance and height. Any touch, drag or scroll on the map, the button again, turning 3D off, closing
  // or leaving the page stops it; the view then turns north-up again. Only offered at the full motion level.
  useEffect(() => {
    const map = mapRef.current;
    if (!flying || !map || !expanded || !terrain) return;
    const path = flightPath(line ?? stops.map((s) => s.position));
    if (path.total === 0) return;
    const seconds = flightSeconds(path.total);
    // Where it pauses (2026-11-26, user): at each waypoint the admin left on (automatic: stamp places and side trips), for
    // that waypoint's seconds, with its card; 次へ ends a pause early.
    const pauses = flightStops(path, stops.filter((s) => s.fly).map((s) => ({ id: s.id, position: s.position })));
    const pauseSeconds = new Map(stops.map((s) => [s.id, s.fly?.seconds ?? 0]));
    let last = 0;
    let d = 0;
    let nextPause = 0;
    let holdUntil = 0;
    let frame = 0;
    let bearing = headingAt(path, 0);
    let shown = "";
    skipPause.current = false;
    const tick = (now: number) => {
      const dt = last ? now - last : 0;
      last = now;
      if (holdUntil) {
        if (now < holdUntil && !skipPause.current) {
          frame = requestAnimationFrame(tick);
          return;
        }
        holdUntil = 0;
        skipPause.current = false;
        setFlyCardId(null);
      } else {
        d = Math.min(path.total, d + (dt / 1000 / seconds) * path.total);
      }
      const pause = pauses[nextPause];
      if (pause && d >= pause.d) {
        d = pause.d;
        nextPause++;
        holdUntil = now + (pauseSeconds.get(pause.id) ?? 5) * 1000;
        setFlyCardId(pause.id);
      }
      const at = pointAt(path, d);
      bearing = turnToward(bearing, headingAt(path, d), 0.06);
      map.jumpTo({ center: [at.lng, at.lat], bearing, pitch: 60, zoom: 14.5 });
      setElevationCursor(at);
      const height = heightAt(path, lineElevations, d);
      const next = { km: (d / 1000).toFixed(1), m: height === null ? null : Math.round(height) };
      if (`${next.km}|${next.m}` !== shown) {
        shown = `${next.km}|${next.m}`;
        setFlightAt(next);
      }
      if (d >= path.total && !holdUntil) setFlying(false);
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const box = map.getCanvasContainer();
    const interrupt = () => setFlying(false);
    const onHide = () => document.hidden && setFlying(false);
    box.addEventListener("pointerdown", interrupt);
    box.addEventListener("wheel", interrupt, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    return () => {
      cancelAnimationFrame(frame);
      box.removeEventListener("pointerdown", interrupt);
      box.removeEventListener("wheel", interrupt);
      document.removeEventListener("visibilitychange", onHide);
      setElevationCursor(null);
      setFlightAt(null);
      setFlyCardId(null);
      map.easeTo({ bearing: 0, duration: motionLevel() === "full" ? 600 : 0 });
    };
  }, [flying, expanded, terrain, mapGen, line, stops, lineElevations]);

  // Expanded view: keep the page still behind it, close on Escape, and move focus sensibly.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setExpanded(false);
    document.addEventListener("keydown", onKey);
    document.body.classList.add("overflow-hidden", "map-expanded");
    closeRef.current?.focus();
    const opener = expandRef.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("overflow-hidden", "map-expanded");
      setTerrain(false); // the small map on the page stays flat and plain
      setFlying(false);
      opener?.focus();
    };
  }, [expanded]);

  const zoom = (delta: 1 | -1) => {
    const map = mapRef.current;
    if (!map) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const options = calm ? { duration: 0 } : undefined;
    if (delta > 0) map.zoomIn(options);
    else map.zoomOut(options);
  };

  // The plain map's stop-by-stop control: previous and next move the map to one stop at a time, so a
  // visitor never has to tap a stop in a crowd of markers.
  const stopIndex = selectedStop ? stops.findIndex((s) => s.id === selectedStop.id) : -1;
  const goToStop = (delta: 1 | -1) => {
    const index = Math.min(stops.length - 1, Math.max(0, stopIndex === -1 ? (delta > 0 ? 0 : stops.length - 1) : stopIndex + delta));
    const stop = stops[index];
    const map = mapRef.current;
    if (!stop) return;
    setSelected({ kind: "stop", id: stop.id });
    map?.easeTo({ center: [stop.position.lng, stop.position.lat], zoom: Math.max(map.getZoom(), 15.5) });
  };

  const toggleGroup = (group: PlaceGroup) =>
    setActive((current) => {
      const next = new Set(current);
      if (!next.delete(group)) next.add(group);
      return next;
    });

  // Picking a place in the list: show it on the map and bring the map into view.
  const showPlace = (id: string) => {
    const place = places.find((p) => p.id === id);
    const map = mapRef.current;
    setSelected({ kind: "place", id });
    setListOpen(false);
    if (!place || !map) return;
    map.easeTo({ center: [place.position.lng, place.position.lat], zoom: Math.max(map.getZoom(), 15.5) });
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sectionRef.current?.scrollIntoView({ block: "start", behavior: calm ? "auto" : "smooth" });
  };

  const sortedPlaces = useMemo(
    () => (origin ? sortByDistance(visiblePlaces, origin) : visiblePlaces.map((p) => ({ ...p, meters: 0 }))),
    [visiblePlaces, origin],
  );
  const stopName = selectedStop?.name ?? "";
  const fromLabel = selectedStop
    ? t`「${stopName}」から近い順`
    : t`コースの出発地点から近い順（まっすぐ測った距離です）`;
  const anyPlaces = places.length > 0;

  if (failed) {
    return (
      <p className="rounded-lg bg-surface p-4 text-lg">
        {t`この端末では地図を表示できません。下の一覧から場所を選べます。`}
      </p>
    );
  }

  const stepper = stops.length > 1;
  const flyCardStop = flyCardId ? stops.find((s) => s.id === flyCardId) : undefined;

  return (
    <section
      ref={sectionRef}
      aria-label={t`地図`}
      // Enlarged (2026-11-26, user): the map is the whole screen, edge to edge, with every control floating on it: ✕ at the
      // top left, the layer pills beside it, zoom at the top right, the stepper at the bottom. Its own @container, so from a
      // wide screen it takes the over-the-map layout of the wide page.
      data-expanded={expanded || undefined}
      className={expanded ? "trail-map @container fixed inset-0 z-30 bg-paper" : "trail-map relative flex scroll-mt-2 flex-col gap-2 @4xl:h-full"}
    >
      {expanded ? (
        <button
          ref={closeRef}
          type="button"
          onClick={() => setExpanded(false)}
          aria-label={t`閉じる`}
          className="tap-target absolute left-3 top-[calc(0.75rem+var(--top-clear))] z-20 inline-flex size-12 items-center justify-center rounded-full border border-ink bg-paper text-ink shadow-md print:hidden"
        >
          <CloseIcon />
        </button>
      ) : null}

      {/* Everything the visitor works the map with lies on it (2026-11-11): the small zoom and full-screen buttons at the
          top right, the kinds of place at the bottom left, previous and next stop at the bottom right, and the stop's card
          above them. On a wide page the map is the whole right column, to the screen's edges. */}
      <div
        className={
          expanded
            ? "absolute inset-0 overflow-hidden"
            : "relative -mx-4 h-[min(62svh,40rem)] min-h-[20rem] overflow-hidden border-y-2 border-line @4xl:mx-0 @4xl:h-full @4xl:min-h-0 @4xl:border-0"
        }
      >
        {/* MapLibre's own CSS makes its container position: relative, which would cancel an
            absolute inset-0 on it, so the wrapper does the sizing and the container fills it. */}
        <div className="trail-map-canvas absolute inset-0">
          <div ref={containerRef} className="h-full w-full" />
        </div>

        {loaded ? null : (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface text-lg">
            {t`地図を読み込み中…`}
          </p>
        )}

        {draft ? (
          // Enlarged: below the row of the ✕ and the pills.
          <p className={`absolute z-10 flex max-w-[calc(100%-4rem)] items-center gap-1.5 rounded-lg border-2 border-caution bg-paper px-2 py-1 text-base font-bold leading-tight ${expanded ? "left-3 top-[calc(4.5rem+var(--top-clear))]" : "left-2 top-2"}`}>
            <span className="text-caution">
              <WarningIcon />
            </span>
            {t`仮のコース・位置（未確認）`}
          </p>
        ) : null}

        {/* Where the fly-along is: the distance from the start and the height there (from the line, as the elevation chart). */}
        {flightAt ? (
          <p
            aria-live="off"
            className={`absolute left-3 z-10 rounded-lg bg-paper/95 px-3 py-1 text-lg font-bold tabular-nums text-ink shadow-sm ${draft ? "top-[calc(7.5rem+var(--top-clear))]" : "top-[calc(4.5rem+var(--top-clear))]"}`}
          >
            {flightAt.m === null ? `${flightAt.km} km` : t`標高 ${flightAt.m} m・${flightAt.km} km`}
          </p>
        ) : null}

        <div className={`absolute z-10 flex flex-col print:hidden ${expanded ? "right-2 top-[calc(0.5rem+var(--top-clear))]" : "right-1 top-1"}`}>
          <button type="button" onClick={() => zoom(1)} aria-label={t`拡大`} className={hit}>
            <span className={disc}>
              <PlusIcon size={20} />
            </span>
          </button>
          <button type="button" onClick={() => zoom(-1)} aria-label={t`縮小`} className={hit}>
            <span className={disc}>
              <MinusIcon size={20} />
            </span>
          </button>
          {expanded ? null : (
            <button ref={expandRef} type="button" onClick={() => setExpanded(true)} aria-label={t`大きく表示`} className={hit}>
              <span className={disc}>
                <ExpandIcon />
              </span>
            </button>
          )}
        </div>

        {listOpen && sortedPlaces.length > 0 ? (
          <div className={`absolute inset-0 z-20 overflow-y-auto bg-paper p-4 ${expanded ? "pt-[calc(1rem+var(--top-clear))]" : ""}`}>
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={() => setListOpen(false)} className={buttonClass}>
                {t`閉じる`}
              </button>
            </div>
            <PlaceList items={sortedPlaces} fromLabel={fromLabel} selectedId={selectedPlace?.id ?? null} onSelect={showPlace} />
          </div>
        ) : null}
      </div>
      {/* Enlarged: one layer over the whole map that lets touches through to it; the pills rise to the top row (order-first,
          mb-auto), the rest sits at the bottom, above the required map credit. */}
      <div className={`flex flex-col gap-2 px-3 print:hidden ${expanded ? "pointer-events-none absolute inset-0 z-10 justify-end pb-[calc(2.25rem+env(safe-area-inset-bottom,0px))] pt-[calc(0.75rem+var(--top-clear))] [&>*]:pointer-events-auto" : "pb-2 @4xl:pointer-events-none @4xl:absolute @4xl:inset-x-2 @4xl:bottom-8 @4xl:z-10 @4xl:max-h-[calc(100%-4rem)] @4xl:p-0 @4xl:[&>*]:pointer-events-auto"}`}>
        {flyCardStop?.fly ? <FlyCard stop={flyCardStop} fly={flyCardStop.fly} onNext={() => (skipPause.current = true)} /> : null}
        {selectedStop || selectedPlace ? (
          // Under the map a stop's card joins the stepper, which already names it (below); this one is for over the map.
          <div className={`order-2 min-h-0 overflow-y-auto rounded-xl shadow-md @4xl:order-none ${selectedStop && stepper ? "hidden @4xl:block" : ""}`}>
            {selectedStop ? (
              <StopCard
                order={selectedStop.order}
                name={selectedStop.name}
                nameLang={selectedStop.nameLang}
                status={selectedStop.status}
                href={selectedStop.href}
                noStamp={selectedStop.noStamp}
                draft={draft}
                onClose={() => setSelected(null)}
              />
            ) : selectedPlace ? (
              <PlaceCard place={selectedPlace} meters={origin ? sortByDistance([selectedPlace], origin)[0]!.meters : null} onClose={() => setSelected(null)} />
            ) : null}
          </div>
        ) : null}
        {/* On a phone the row dissolves into the block (contents) so the stepper stays right under the map, then the stop's card, then the chips. */}
          <div className="contents @4xl:flex @4xl:flex-row @4xl:items-end @4xl:justify-between @4xl:gap-2">
          {/* One strip of single-line layer pills that wraps (under the map and over it), so the elevation chart stays close to the map. */}
          {/* One line that scrolls sideways on a narrow screen (user, 2026-11-26: wrapped pills took too much room): under the
              map, or enlarged as the top row between the ✕ and the zoom buttons. The padding leaves room for the ✓ badges. */}
          <div
            className={`flex min-w-0 items-center gap-2 @4xl:order-none @4xl:gap-1.5 ${
              expanded
                ? "order-first mb-auto ml-14 mr-12 flex-nowrap overflow-x-auto px-1.5 py-2 [scrollbar-width:none] [&_button]:shrink-0 @4xl:m-0 @4xl:flex-wrap @4xl:overflow-visible @4xl:py-0"
                : "order-3 -mx-1.5 flex-nowrap overflow-x-auto px-1.5 py-2 [scrollbar-width:none] [&_button]:shrink-0 @4xl:mx-0 @4xl:flex-wrap @4xl:overflow-visible @4xl:p-0"
            }`}
          >
            {expanded && draft ? <SampleNoticeButton /> : null}
            {expanded ? (
              <button
                type="button"
                onClick={() => {
                  setTerrain((on) => !on);
                  setFlying(false);
                }}
                aria-pressed={terrain}
                className={filterPill(terrain)}
              >
                <TickBadge on={terrain} />
                {t`立体の地図（3D）`}
              </button>
            ) : null}
            {/* The fly-along: only over the 3D map, and only at the full motion level (a moving camera is a lot of motion). */}
            {expanded && terrain && motionLevel() === "full" ? (
              <button type="button" onClick={() => setFlying((on) => !on)} aria-pressed={flying} className={filterPill(flying)}>
                {flying ? <StopIcon /> : <PlayIcon />}
                {t`コースをたどる`}
              </button>
            ) : null}
            {anyPlaces ? <PlaceChips className="contents" counts={counts} active={active} onToggle={toggleGroup} /> : null}
            {hasSide ? (
              <button type="button" aria-pressed={showSide} onClick={() => setShowSide((on) => !on)} className={filterPill(showSide)}>
                <TickBadge on={showSide} />
                {t`寄り道`}
              </button>
            ) : null}
            {sortedPlaces.length > 0 ? (
              <button type="button" aria-expanded={listOpen} onClick={() => setListOpen((on) => !on)} className={expanded ? listLinkOverMap : listLink}>
                <ListIcon />
                {t`周辺の施設`}
              </button>
            ) : null}
          </div>
          {stepper ? (
            // With a stop chosen, under the map, the pill grows into one block with that stop's card (no second name).
            <div className={`order-1 w-full shrink-0 border border-ink bg-paper/95 shadow-sm @4xl:order-none @4xl:w-auto @4xl:rounded-full ${selectedStop ? "rounded-xl" : "rounded-full"}`}>
            <div role="group" aria-label={t`スポットを順に見る`} className="flex items-center">
              {/* Under the map the bar says what it steps through, then the stop it is on; over the map it is just the arrows and count. */}
              <p className="min-w-0 flex-1 truncate pl-4 text-lg font-bold @4xl:hidden" lang={selectedStop?.nameLang}>
                {selectedStop ? `${selectedStop.order ? `${selectedStop.order}. ` : ""}${selectedStop.name}` : t`スポットを順に見る`}
              </p>
              <button type="button" onClick={() => goToStop(-1)} disabled={stopIndex === 0} aria-label={t`前の場所`} className={hit}>
                <ChevronLeftIcon />
              </button>
              <p aria-live="polite" className="min-w-[3.75rem] text-center text-lg font-bold tabular-nums">
                {stopIndex === -1 ? "－" : stopIndex + 1} / {stops.length}
              </p>
              <button type="button" onClick={() => goToStop(1)} disabled={stopIndex === stops.length - 1} aria-label={t`次の場所`} className={hit}>
                <ChevronIcon />
              </button>
            </div>
            {selectedStop ? (
              <div className="border-t border-line px-4 pb-3 pt-2 @4xl:hidden">
                <StopCard
                  bare
                  order={selectedStop.order}
                  name={selectedStop.name}
                  nameLang={selectedStop.nameLang}
                  status={selectedStop.status}
                  href={selectedStop.href}
                  noStamp={selectedStop.noStamp}
                  draft={draft}
                  onClose={() => setSelected(null)}
                />
              </div>
            ) : null}
            </div>
          ) : null}
        </div>
      </div>

    </section>
  );
}
