// The phone's compass for heading-up navigation (docs/navigation-v2-plan.md, user 2026-11-16: "compass yes"). Browser
// events only, no library: Android Chrome sends `deviceorientationabsolute` (alpha counter-clockwise from north), an iPhone
// sends `deviceorientation` with `webkitCompassHeading` (clockwise from north) after a permission asked inside a tap.
// The pure parts (reading an event, smoothing) are tested; the listeners are thin.

/** An angle brought back into 0 to 359.9…°: 370 → 10, -10 → 350. (`%` alone would give -10 for -10, hence the + 360.) */
const wrap360 = (deg: number) => ((deg % 360) + 360) % 360;

/** Degrees clockwise from north for one orientation event, corrected for how the screen is turned; null when the event has none. */
export function headingOf(e: { alpha?: number | null; absolute?: boolean; webkitCompassHeading?: number }, screenAngle: number, fromAbsoluteEvent: boolean): number | null {
  let h: number | null = null;
  if (typeof e.webkitCompassHeading === "number" && Number.isFinite(e.webkitCompassHeading)) h = e.webkitCompassHeading;
  else if (fromAbsoluteEvent && typeof e.alpha === "number" && Number.isFinite(e.alpha)) h = 360 - e.alpha;
  if (h === null) return null;
  return wrap360(h + screenAngle);
}

/**
 * The shortest turn from `a` to `b`, in degrees: positive = turn right (clockwise), negative = turn left, never more than 180.
 * From 350° to 10° is +20 (right, through north), not -340.
 */
export const turnBetween = (a: number, b: number) => wrap360(b - a + 180) - 180;

/**
 * A calm heading. A compass needle jitters, so each new reading moves the map only `share` (a quarter) of the way there.
 * Example: the map shows 350°, the compass says 10°. The short turn is +20°, a quarter of it is +5°, so the map goes to 355°
 * (and on the next readings 359°, 2°, …), instead of jumping, or spinning 340° the long way round.
 */
export function smoothHeading(prev: number | null, next: number, share = 0.25): number {
  if (prev === null) return next; // the first reading: nothing to smooth yet
  const step = turnBetween(prev, next) * share;
  return wrap360(prev + step);
}

type OrientationCtor = { requestPermission?: () => Promise<"granted" | "denied"> };

/**
 * Ask for the compass where the browser wants a tap first (an iPhone). Call it inside the tap's handler, before any await.
 * Elsewhere it resolves true at once; it never throws.
 */
export function askCompass(): Promise<boolean> {
  try {
    const ctor = (typeof window !== "undefined" ? window.DeviceOrientationEvent : undefined) as unknown as OrientationCtor | undefined;
    if (!ctor?.requestPermission) return Promise.resolve(true);
    return ctor.requestPermission().then((r) => r === "granted").catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

/** Listen to the compass; `onHeading` gets degrees clockwise from north. Returns the function that stops listening. */
export function watchCompass(onHeading: (deg: number) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const angle = () => (typeof screen !== "undefined" && screen.orientation ? screen.orientation.angle : 0);
  let gotAbsolute = false;
  const onAbsolute = (e: Event) => {
    const h = headingOf(e as DeviceOrientationEvent, angle(), true);
    if (h !== null) {
      gotAbsolute = true;
      onHeading(h);
    }
  };
  // An iPhone's plain event carries webkitCompassHeading; on Android the plain event is relative to how the phone started, so it is used only by an iPhone.
  const onPlain = (e: Event) => {
    if (gotAbsolute) return;
    const h = headingOf(e as DeviceOrientationEvent & { webkitCompassHeading?: number }, angle(), false);
    if (h !== null) onHeading(h);
  };
  window.addEventListener("deviceorientationabsolute", onAbsolute);
  window.addEventListener("deviceorientation", onPlain);
  return () => {
    window.removeEventListener("deviceorientationabsolute", onAbsolute);
    window.removeEventListener("deviceorientation", onPlain);
  };
}
