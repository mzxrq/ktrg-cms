import { Trans } from "@lingui/react/macro";
import { pickText } from "@/lib/pick-text";

/**
 * What a place off the way is called: 寄り道 for a side trip; for a place not connected to the route at all (遥拝, detached)
 * the editor's own words, or 道からはなれた場所 when none were written (2026-11-17, user).
 */
export function SideWord({ item, locale }: { item: { detached?: boolean; detachedLabelJa?: string | null; detachedLabelEn?: string | null }; locale: string }) {
  if (!item.detached) return <Trans>寄り道</Trans>;
  const own = pickText(locale, item.detachedLabelJa ?? null, item.detachedLabelEn ?? null);
  return own ? <span lang={own.lang}>{own.text}</span> : <Trans>道からはなれた場所</Trans>;
}
