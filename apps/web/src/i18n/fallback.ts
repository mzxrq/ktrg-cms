import type { Messages } from "@lingui/core";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A language other than Japanese and English (Thai, a preview) reads the English where its own text is not written yet,
 * and Japanese only where neither is. An unwritten message arrives as its Japanese source, so that is what is replaced.
 * The client gets these merged messages from the server, so it falls back the same way.
 */
export function withFallback(own: Messages, ja: Messages, en: Messages): Messages {
  const out: Messages = { ...en };
  for (const [id, text] of Object.entries(own)) if (text !== undefined && text !== "" && !same(text, ja[id])) out[id] = text;
  return out;
}
