/** The section being read: of those whose top has reached `line`, the one lowest on screen (or -1 when none has).
 *  By position, not list order: the course page reorders its sections with CSS `order`. */
export function activeSection(tops: number[], line: number): number {
  let active = -1;
  tops.forEach((top, i) => {
    if (top <= line && (active === -1 || top > tops[active]!)) active = i;
  });
  return active;
}

/** Where reading happens: a third of the way down the screen below the sticky bar. Well past the gap a jump leaves above a
 *  section (its scroll-margin, 5rem), so the section jumped to counts at once. */
export const readingLine = (barBottom: number, screenHeight: number) => barBottom + (screenHeight - barBottom) / 3;
