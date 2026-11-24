import { defineConfig } from "@lingui/cli";
import { catalogLocales, defaultLocale } from "./src/i18n/locales";

export default defineConfig({
  // Every catalog, whichever are switched on here (so extract gives the same files everywhere).
  locales: [...catalogLocales],
  // Japanese is the source language; untranslated English falls back to it.
  sourceLocale: defaultLocale,
  fallbackLocales: { default: defaultLocale },
  catalogs: [{ path: "src/locales/{locale}", include: ["src/"] }],
});
