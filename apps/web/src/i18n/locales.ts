// Single source of truth for supported locales. Kept free of Lingui and Next
// imports so the proxy, the Lingui CLI config and tests can all import it.

/** Every language with a catalog (src/locales/<locale>.po). The Lingui config extracts all of them, always. */
export const catalogLocales = ["ja", "en", "th"] as const;
export type Locale = (typeof catalogLocales)[number];

/**
 * Languages still being written (Thai, 2026-11-24, user): offered only where NEXT_PUBLIC_PREVIEW_LOCALES names them
 * (a local env file, Vercel's Preview environment), never on the live site. Read at build time.
 */
const previewLocales: readonly string[] = (process.env.NEXT_PUBLIC_PREVIEW_LOCALES ?? "").split(",").map((l) => l.trim());

/** The languages visitors can choose here: Japanese and English, plus the preview ones switched on. */
export const locales: readonly Locale[] = catalogLocales.filter((l) => l === "ja" || l === "en" || previewLocales.includes(l));

/** Japanese is the source language and the final fallback. */
export const defaultLocale: Locale = "ja";

/** Remembers the visitor's choice until accounts exist (then users.locale wins). */
export const localeCookie = "locale";

export function isLocale(value: string | undefined | null): value is Locale {
  return locales.some((locale) => locale === value);
}

/** What the API stores for an account and writes its emails in: only Japanese and English, so another language is English. */
export const accountLocale = (locale: string): "ja" | "en" => (locale === "ja" ? "ja" : "en");
