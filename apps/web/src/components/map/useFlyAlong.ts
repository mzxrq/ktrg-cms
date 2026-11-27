"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { GSI_DEM_SOURCE } from "@/lib/gsi-dem";
import { gsiAttribution } from "@/lib/map";
import { flightPath, flightSeconds, flightStops, headingAt, heightAt, pointAt, turnToward, type FlyStop } from "@/lib/fly-along";
import { motionLevel } from "@/lib/motion";

type LatLng = { lat: number; lng: number };

/** Where the flight is: the distance from the start and the height there (null where the line has none). */
export type FlightAt = { km: string; m: number | null };

/** The elevation source the course page and the big map both use (registerGsiDem must have run on that map). */
export const DEM_SOURCE = "gsi-dem";

/**
 * The fly-along (2026-11-26, user): the 3D camera follows the course from start to goal, looking ahead along it, and pauses at
 * each stop that has `fly` for its seconds. The one player for the course page's map (TrailMap) and the big map (MapScreenCanvas).
 * Any touch, drag or scroll on the map, or leaving the page, calls `onEnd`; the view then turns north-up again. The ground is
 * raised for the flight when it is not raised already, and lowered again after.
 */
export function useFlyAlong({
  mapRef,
  on,
  line,
  stops,
  heights,
  onPause,
  onEnd,
  onMove,
  mapGen = 0,
}: {
  mapRef: RefObject<MapLibreMap | null>;
  on: boolean;
  /** The course's path; without one the flight goes straight from stop to stop. */
  line: readonly LatLng[] | null;
  stops: readonly { id: string; position: LatLng; fly?: FlyStop | null }[];
  /** The height of each point of `line`, for the readout. */
  heights?: readonly (number | null)[] | null;
  /** A pause starts at this stop (its id), or runs out (null). Stopping the flight mid-pause leaves the stop chosen. */
  onPause: (id: string | null) => void;
  onEnd: () => void;
  /** Each frame, where the camera is (null once it stops): the course page moves the elevation chart's cursor with it. */
  onMove?: (at: LatLng | null) => void;
  /** Goes up when the map is rebuilt (a new style). */
  mapGen?: number;
}) {
  const [flightAt, setFlightAt] = useState<FlightAt | null>(null);
  // 次へ while paused: go on before its seconds are up.
  const skipPause = useRef(false);
  const calls = useRef({ onPause, onEnd, onMove });
  useEffect(() => {
    calls.current = { onPause, onEnd, onMove };
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!on || !map) return;
    const path = flightPath(line ?? stops.map((s) => s.position));
    if (path.total === 0) return;
    let raised = false;
    if (!map.getTerrain()) {
      if (!map.getSource(DEM_SOURCE)) map.addSource(DEM_SOURCE, { ...GSI_DEM_SOURCE, attribution: gsiAttribution });
      map.setTerrain({ source: DEM_SOURCE, exaggeration: 1.5 });
      raised = true;
    }
    const seconds = flightSeconds(path.total);
    // Where it pauses (2026-11-26, user): at each waypoint the admin left on (automatic: stamp places and side trips), for
    // that waypoint's seconds.
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
        calls.current.onPause(null);
      } else {
        d = Math.min(path.total, d + (dt / 1000 / seconds) * path.total);
      }
      const pause = pauses[nextPause];
      if (pause && d >= pause.d) {
        d = pause.d;
        nextPause++;
        holdUntil = now + (pauseSeconds.get(pause.id) ?? 5) * 1000;
        calls.current.onPause(pause.id);
      }
      const at = pointAt(path, d);
      bearing = turnToward(bearing, headingAt(path, d), 0.06);
      map.jumpTo({ center: [at.lng, at.lat], bearing, pitch: 60, zoom: 14.5 });
      calls.current.onMove?.(at);
      const height = heightAt(path, heights, d);
      const next = { km: (d / 1000).toFixed(1), m: height === null ? null : Math.round(height) };
      if (`${next.km}|${next.m}` !== shown) {
        shown = `${next.km}|${next.m}`;
        setFlightAt(next);
      }
      if (d >= path.total && !holdUntil) calls.current.onEnd();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    const box = map.getCanvasContainer();
    const interrupt = () => calls.current.onEnd();
    const onHide = () => document.hidden && calls.current.onEnd();
    box.addEventListener("pointerdown", interrupt);
    box.addEventListener("wheel", interrupt, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    return () => {
      cancelAnimationFrame(frame);
      box.removeEventListener("pointerdown", interrupt);
      box.removeEventListener("wheel", interrupt);
      document.removeEventListener("visibilitychange", onHide);
      calls.current.onMove?.(null);
      setFlightAt(null);
      // The map may already be gone (the page was left mid-flight).
      if (!map.getCanvasContainer().isConnected) return;
      if (raised) map.setTerrain(null);
      map.easeTo({ bearing: 0, ...(raised ? { pitch: 0 } : {}), duration: motionLevel() === "full" ? 600 : 0 });
    };
  }, [on, mapRef, mapGen, line, stops, heights]);

  return { flightAt, skip: () => (skipPause.current = true) };
}
