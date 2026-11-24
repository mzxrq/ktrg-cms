// Choosing the text for a language. Pure and free of content data, so client components may import it.

export interface Picked {
  text: string;
  lang: "ja" | "en";
  /** Another language was requested but only Japanese exists. */
  fallback: boolean;
}

/**
 * The text for a locale: Japanese for Japanese, English for everyone else (a preview language such as Thai reads the English
 * until content in it reaches visitors), Japanese when no English was entered.
 */
export function pickText(locale: string, ja: string | null, en: string | null): Picked | null {
  if (locale !== "ja" && en) return { text: en, lang: "en", fallback: false };
  if (ja) return { text: ja, lang: "ja", fallback: locale !== "ja" };
  return null;
}
