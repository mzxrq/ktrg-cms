/**
 * An admin page's explanation as its first sentence (shown under the title) and the rest (behind an (i) button), so an
 * admin who knows the page reads one line and a new one can still open the whole text. Japanese ends a sentence with
 * 「。」, English with ". " (a dot inside "1.5" or "e.g." without a space does not count).
 */
export function splitIntro(text: string): { summary: string; more: string | null } {
  const ja = text.indexOf("。");
  const en = text.search(/\.\s/);
  const ends = [ja === -1 ? -1 : ja + 1, en === -1 ? -1 : en + 1].filter((i) => i > 0);
  if (ends.length === 0) return { summary: text.trim(), more: null };
  const at = Math.min(...ends);
  const more = text.slice(at).trim();
  return { summary: text.slice(0, at).trim(), more: more || null };
}
