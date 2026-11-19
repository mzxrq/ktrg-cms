/** A label that stands at a point: its number circle sits on the point and its name runs out to one side. */
export type SideLabel = { x: number; y: number; width: number; height: number; circle: number };
export type Side = "right" | "left";

type Rect = { l: number; r: number; t: number; b: number };
const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

/**
 * Picks for each label (in the given order) the side its name runs out to: right unless that overlaps more than the left
 * would, counting the labels already placed and every number circle. Coordinates in screen pixels, y downwards, the
 * label's bottom on the point.
 */
export function labelSides(labels: SideLabel[]): Side[] {
  const circles: Rect[] = labels.map((l) => ({ l: l.x - l.circle / 2, r: l.x + l.circle / 2, t: l.y - l.circle, b: l.y }));
  const placed: Rect[] = [];
  return labels.map((l, i) => {
    const half = l.circle / 2;
    const right: Rect = { l: l.x - half, r: l.x - half + l.width, t: l.y - l.height, b: l.y };
    const left: Rect = { l: l.x + half - l.width, r: l.x + half, t: l.y - l.height, b: l.y };
    const cost = (rect: Rect) => [...placed, ...circles.filter((_, j) => j !== i)].reduce((n, o) => n + overlap(rect, o), 0);
    const goLeft = cost(left) < cost(right);
    placed.push(goLeft ? left : right);
    return goLeft ? "left" : "right";
  });
}
