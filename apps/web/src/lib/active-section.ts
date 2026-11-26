/** The section being read: the last one whose top has reached `line` (just under the sticky bar), or -1 above the first. */
export function activeSection(tops: number[], line: number): number {
  let active = -1;
  tops.forEach((top, i) => {
    if (top <= line) active = i;
  });
  return active;
}
