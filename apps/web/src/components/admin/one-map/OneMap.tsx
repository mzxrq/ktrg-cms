"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import type { EditorPlace } from "@/components/admin/map-editor/MapEditor";
import { createMarkerElement } from "@/components/map/MapMarker";
import { useErrorMessages } from "@/components/useErrorMessages";
import { api } from "@/lib/api";
import { outcome } from "@/lib/admin/admin-client";
import { editorPlacesOf } from "@/lib/admin/editor-places";
import { boxOf, COURSE_HIT, ONE_MAP_COLOURS as C, COURSE_SOURCE, courseFeatures, oneMapLayers, POINT_HIT, POINT_SOURCE, pointFeatures, type CourseChoice, type Overview } from "@/lib/admin/one-map";
import { draftFromServer } from "@/lib/admin/route-draft";
import type { AdminRoute, AdminSpot } from "@/lib/admin/types";
import { editorStyle, zoomLimits } from "@/lib/map";
import { inputClass } from "../fields";

const START = { center: [135.45, 34.45] as [number, number], zoom: 9 };
const FIT = { padding: 60, maxZoom: 15 };
const draftTag = "rounded-md border border-dashed border-line px-1.5 text-base text-muted";

type Picked = { what: "spot" | "place"; id: string } | null;

/**
 * The admin's one map, read only (docs/one-map-editor-design.md, step 3): every course, waypoint and directory place in
 * view. Choosing a course raises it (its waypoints become the editor's pins, the rest turns faint) and moves the map to it.
 * Each thing links to the screen that edits it.
 */
export function OneMap({ courses, initialChosen }: { courses: CourseChoice[]; initialChosen: string | null }) {
  const { t } = useLingui();
  const messages = useErrorMessages();
  // Read through a ref: the messages are a new object each render, and a dependency on them would fetch again every render.
  const latestMessages = useRef(messages);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mlRef = useRef<typeof import("maplibre-gl") | null>(null);
  const pins = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [chosen, setChosen] = useState<string | null>(initialChosen && courses.some((c) => c.id === initialChosen) ? initialChosen : null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [own, setOwn] = useState<{ id: string; places: EditorPlace[] } | { id: string; error: string } | null>(null);
  const [picked, setPicked] = useState<Picked>(null);
  // What the map's own listeners (made once) need from the latest render.
  const latest = useRef<{ chosen: string | null; choose: (id: string | null) => void; load: () => Promise<void> }>({ chosen, choose: () => {}, load: async () => {} });

  const choice = courses.find((c) => c.id === chosen) ?? null;
  const ownPlaces = own && own.id === chosen && "places" in own ? own.places : null;

  const choose = (id: string | null) => {
    setChosen(id);
    setPicked(null);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("course", id);
    else url.searchParams.delete("course");
    window.history.replaceState(null, "", url.href); // a string: the service worker library forwards this value, and a URL object cannot be sent
    const to = courses.find((c) => c.id === id)?.bounds;
    if (to) mapRef.current?.fitBounds(to, FIT);
  };

  // Only the answer for the newest view is drawn: panning fast can bring an older answer back after a newer one.
  const asked = useRef(0);
  const load = async () => {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    const n = ++asked.current;
    setLoading(true);
    const res = await outcome(api.admin.map.overview.get({ query: boxOf({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }) }));
    if (n !== asked.current) return;
    setLoading(false);
    if (res.ok) {
      setOverview(res.data as unknown as Overview); // the API's own shape (map-overview.ts); Eden types it as a union with the error body
      setError(null);
    } else setError(latestMessages.current[res.key]);
  };

  useEffect(() => {
    latest.current = { chosen, choose, load };
    latestMessages.current = messages;
  });

  // ---- the map, created once -----------------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const ml = await import("maplibre-gl");
      if (cancelled || !container.current) return;
      ml.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).toString());
      const first = courses.find((c) => c.id === latest.current.chosen)?.bounds;
      map = new ml.Map({
        container: container.current,
        style: editorStyle(),
        center: START.center,
        zoom: START.zoom,
        bounds: first ?? undefined,
        fitBoundsOptions: { ...FIT, animate: false },
        minZoom: zoomLimits.min,
        maxZoom: zoomLimits.max,
        dragRotate: false,
        pitchWithRotate: false,
        attributionControl: { compact: false },
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
      map.on("error", () => {});
      mapRef.current = map;
      mlRef.current = ml;

      let started = false;
      const start = () => {
        if (started || cancelled || !map || !map.isStyleLoaded()) return;
        started = true;
        map.addSource(COURSE_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addSource(POINT_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        for (const layer of oneMapLayers()) map.addLayer(layer);
        setReady(true);
        void latest.current.load();
      };
      map.on("styledata", start);
      map.on("load", start);
      start();

      // One way to fetch: after every move (a fly to a course is a move too), once the map has stopped.
      map.on("moveend", () => {
        clearTimeout(timer);
        timer = setTimeout(() => void latest.current.load(), 300);
      });
      // A click picks a dot, or else chooses the course under it.
      map.on("click", (e) => {
        const hit = map!.queryRenderedFeatures(e.point, { layers: [POINT_HIT, COURSE_HIT] });
        const dot = hit.find((f) => f.layer.id === POINT_HIT);
        const line = hit.find((f) => f.layer.id === COURSE_HIT);
        if (dot) setPicked({ what: dot.properties.what === "place" ? "place" : "spot", id: String(dot.properties.id) });
        else if (line && line.properties.id !== latest.current.chosen) latest.current.choose(String(line.properties.id));
      });
      for (const layer of [POINT_HIT, COURSE_HIT]) {
        map.on("mouseenter", layer, () => (map!.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layer, () => (map!.getCanvas().style.cursor = ""));
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      for (const m of pins.current) m.remove();
      pins.current = [];
      map?.remove(); // CLAUDE.md: the map is always removed on unmount
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; later values are read through `latest`
  }, []);

  // ---- the faint layers ------------------------------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !overview) return;
    (map.getSource(COURSE_SOURCE) as GeoJSONSource | undefined)?.setData(courseFeatures(overview.routes, chosen) as never);
    (map.getSource(POINT_SOURCE) as GeoJSONSource | undefined)?.setData(pointFeatures(overview, chosen) as never);
  }, [ready, overview, chosen]);

  // ---- the chosen course's own waypoints, in order (for the stamp numbers and start/goal colours) ----------------
  useEffect(() => {
    if (!chosen) return;
    let cancelled = false;
    (async () => {
      const res = await outcome(api.admin.routes({ id: chosen }).get());
      if (cancelled) return;
      if (res.ok) {
        const body = res.data as unknown as { route: AdminRoute; spots: AdminSpot[] };
        setOwn({ id: chosen, places: editorPlacesOf(draftFromServer(body.route, body.spots)) });
      } else setOwn({ id: chosen, error: latestMessages.current[res.key] });
    })();
    return () => {
      cancelled = true;
    };
  }, [chosen]);

  // ---- their pins: the course editor's own pins ----------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    for (const m of pins.current) m.remove();
    pins.current = [];
    if (!ready || !map || !ml || !ownPlaces) return;
    for (const p of ownPlaces) {
      if (p.lat === null || p.lng === null) continue;
      const el = createMarkerElement({ order: p.stampable ? p.number : null, label: p.stampable ? `${p.number}. ${p.name}` : p.name, kind: "neutral", status: "open", sideTrip: p.stopBy, noStamp: !p.stampable, role: p.role, place: p.kind, onSelect: () => {} });
      // Stopped here, as in the course editor: otherwise the map's own click also runs and could choose a course under the pin.
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        setPicked({ what: "spot", id: p.key });
      });
      el.dataset.published = String(p.published);
      el.title = p.published ? `${p.name}（公開中）` : p.name;
      el.setAttribute("aria-pressed", String(picked?.id === p.key));
      pins.current.push(new ml.Marker({ element: el, anchor: p.stopBy ? "center" : "bottom" }).setLngLat([p.lng, p.lat]).addTo(map));
    }
  }, [ready, ownPlaces, picked]);

  const spot = picked?.what === "spot" ? overview?.spots.find((s) => s.id === picked.id) : undefined;
  const place = picked?.what === "place" ? overview?.places.find((p) => p.id === picked.id) : undefined;
  const ownPicked = picked?.what === "spot" ? ownPlaces?.find((p) => p.key === picked.id) : undefined;
  const nameOf = (id: string) => courses.find((c) => c.id === id)?.nameJa ?? "";
  const empty = overview && overview.routes.length === 0 && overview.spots.length === 0 && overview.places.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
        <label htmlFor="one-map-course" className="flex flex-1 flex-col gap-1 text-lg font-bold">
          {t`コースを選ぶ`}
          <select id="one-map-course" value={chosen ?? ""} onChange={(e) => choose(e.target.value || null)} className={inputClass}>
            <option value="">{t`選ばない（すべて同じ太さで表示）`}</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.bounds ? c.nameJa : t`${c.nameJa}（線がまだありません）`}
              </option>
            ))}
          </select>
        </label>
        {chosen ? (
          <Link href={`/admin/routes/${chosen}?tab=map`} className="tap-target inline-flex items-center justify-center rounded-full border border-line px-5 text-lg font-bold underline-offset-4 hover:underline">
            {t`このコースを編集する`}
          </Link>
        ) : null}
      </div>
      {choice && !choice.bounds ? <p className="text-lg text-muted">{t`このコースには、まだ線も範囲もないので、地図を動かせません。`}</p> : null}

      <div className="relative">
        <div ref={container} className="h-[34rem] overflow-hidden rounded-2xl bg-surface" role="region" aria-label={t`すべてのコースと場所の地図`} />
        <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-5rem)] flex-col gap-2" aria-live="polite">
          {loading ? <p className="rounded-full bg-paper px-4 py-1 text-base font-bold shadow">{t`読み込み中…`}</p> : null}
          {overview?.tooMany ? <p className="rounded-lg border-l-4 border-caution bg-paper px-4 py-2 text-base font-bold shadow">{t`この範囲には多すぎて、すべては表示できません。地図を拡大してください。`}</p> : null}
          {empty && !loading ? <p className="rounded-lg bg-paper px-4 py-2 text-base shadow">{t`この範囲には、コースも経由地も場所もありません。`}</p> : null}
        </div>
      </div>
      {error ? (
        <p role="alert" className="rounded-lg border-l-4 border-danger bg-surface p-4 text-lg font-bold text-danger">
          {t`地図のデータを読み込めませんでした。`} {error}
        </p>
      ) : null}
      <Legend />

      {spot || place || ownPicked ? (
        <section aria-label={t`選んだもの`} className="flex flex-col gap-2 rounded-lg border-l-4 border-brand bg-surface p-4">
          {place ? (
            <>
              <p className="flex flex-wrap items-center gap-2 text-xl font-bold">
                {place.nameJa}
                {place.published ? null : <span className={draftTag}>{t`下書き`}</span>}
              </p>
              <p className="text-lg text-muted">{t`お店と施設の場所`}</p>
              <Link href={`/admin/directory/${place.id}`} className="tap-target inline-flex items-center text-lg font-bold underline underline-offset-4">
                {t`この場所を編集する`}
              </Link>
            </>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-2 text-xl font-bold">
                {ownPicked?.name ?? spot?.nameJa}
                {(ownPicked?.published ?? spot?.published) ? null : <span className={draftTag}>{t`下書き`}</span>}
              </p>
              <p className="text-lg text-muted">{t`経由地（${nameOf(ownPicked ? chosen! : spot!.routeId)}）`}</p>
              <div className="flex flex-wrap gap-3">
                <Link href={`/admin/routes/${ownPicked ? chosen : spot!.routeId}?tab=places`} className="tap-target inline-flex items-center text-lg font-bold underline underline-offset-4">
                  {t`この経由地を編集する`}
                </Link>
                {spot && spot.routeId !== chosen ? (
                  <button type="button" onClick={() => choose(spot.routeId)} className="tap-target rounded-full border border-line px-5 text-lg font-bold">
                    {t`このコースを選ぶ`}
                  </button>
                ) : null}
              </div>
            </>
          )}
        </section>
      ) : null}

      {chosen ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold">{t`「${choice?.nameJa ?? ""}」の経由地`}</h2>
          {own && own.id === chosen && "error" in own ? (
            <p role="alert" className="text-lg font-bold text-danger">{own.error}</p>
          ) : !ownPlaces ? (
            <p className="text-lg">{t`読み込み中…`}</p>
          ) : ownPlaces.length === 0 ? (
            <p className="text-lg text-muted">{t`経由地は、まだありません。`}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-lg bg-surface px-4">
              {ownPlaces.map((p) => (
                <li key={p.key} className={`flex flex-wrap items-center gap-2 py-2 ${picked?.id === p.key ? "font-bold" : ""}`}>
                  <button type="button" onClick={() => setPicked({ what: "spot", id: p.key })} aria-pressed={picked?.id === p.key} className="tap-target text-left text-lg underline-offset-4 hover:underline">
                    {p.number !== null ? `${p.number}. ` : ""}
                    {p.name || t`（名前なし）`}
                  </button>
                  {p.published ? null : <span className={draftTag}>{t`下書き`}</span>}
                  {p.lat === null ? <span className={draftTag}>{t`位置なし`}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : overview && overview.routes.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold">{t`この範囲のコース`}</h2>
          <ul className="flex flex-col divide-y divide-line rounded-lg bg-surface px-4">
            {[...overview.routes].sort((a, b) => a.sortOrder - b.sortOrder).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                <button type="button" onClick={() => choose(r.id)} className="tap-target text-left text-lg underline underline-offset-4">
                  {r.nameJa}
                </button>
                {r.open ? null : <span className={draftTag}>{t`準備中`}</span>}
                {r.lineVerified ? null : <span className={draftTag}>{t`線を確認していない`}</span>}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/** What the colours mean. Never colour alone: the words say it too, and a draft is also hollow. */
function Legend() {
  const { t } = useLingui();
  const dot = (fill: string, stroke: string) => <span aria-hidden className="inline-block size-4 rounded-full border-2" style={{ background: fill, borderColor: stroke }} />;
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-base">
      <li className="flex items-center gap-2">
        <span aria-hidden className="inline-block h-1.5 w-6 rounded-full" style={{ background: C.chosen }} />
        {t`選んだコース`}
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className="inline-block h-1 w-6 rounded-full opacity-60" style={{ background: C.course }} />
        {t`ほかのコース`}
      </li>
      <li className="flex items-center gap-2">
        {dot(C.course, C.course)}
        {t`ほかのコースの経由地`}
      </li>
      <li className="flex items-center gap-2">
        {dot(C.place, C.place)}
        {t`お店と施設`}
      </li>
      <li className="flex items-center gap-2">
        {dot(C.hollow, C.course)}
        {t`中が白いもの：下書き、または位置を確認していない`}
      </li>
    </ul>
  );
}
