// Where the middle of a course photo is (the editor taps it), in percent from the left and the top. Every place that crops
// the photo (a wide cover, a square card, a pill) keeps that part in view by using it as the CSS object-position.

export interface PhotoFocus {
  x: number;
  y: number;
}

/** The pair from the API, or null when it is not set (or only half set, which the server never sends). */
export const focusFromApi = (x: number | null | undefined, y: number | null | undefined): PhotoFocus | null =>
  typeof x === "number" && typeof y === "number" ? { x, y } : null;

/** The style for a cropped image; nothing when unset, so the browser's own middle stays. */
export const focusStyle = (f: PhotoFocus | null | undefined): { objectPosition: string } | undefined =>
  f ? { objectPosition: `${f.x}% ${f.y}%` } : undefined;

/** Percent (0 to 100, whole numbers) of where a click or tap landed inside a box. */
export function focusAt(clientX: number, clientY: number, box: { left: number; top: number; width: number; height: number }): PhotoFocus {
  const pct = (v: number, from: number, size: number) => (size > 0 ? Math.min(100, Math.max(0, Math.round(((v - from) / size) * 100))) : 50);
  return { x: pct(clientX, box.left, box.width), y: pct(clientY, box.top, box.height) };
}
