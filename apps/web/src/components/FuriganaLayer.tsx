"use client";

import { useEffect } from "react";
import { startFurigana } from "@/lib/furigana-dom";

/**
 * Draws furigana over the page's kanji while the visitor has chosen it (Japanese pages only). Renders nothing. With
 * `alwaysOnly` (furigana off) it draws only the words the admin marked いつも表示する.
 */
export function FuriganaLayer({ alwaysOnly = false }: { alwaysOnly?: boolean }) {
  useEffect(() => (document.documentElement.lang === "ja" ? startFurigana(document.body, alwaysOnly) : undefined), [alwaysOnly]);
  return null;
}
