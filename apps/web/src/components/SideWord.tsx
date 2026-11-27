import { Trans } from "@lingui/react/macro";
import { pickText } from "@/lib/pick-text";

/**
 * What a place off the way is called: 寄り道 for a side trip; for a place not connected to the route at all (遥拝, detached)
 * the editor's own words; when none were written, 「〇〇から遥拝」 from the waypoint it is worshipped from (2026-11-20, user),
 * else ルート外.
 */
export function SideWord({
  item,
  locale,
}: {
  item: { detached?: boolean; detachedLabelJa?: string | null; detachedLabelEn?: string | null; stampFrom?: { nameJa: string; nameEn: string | null } };
  locale: string;
}) {
  if (!item.detached) return <Trans>寄り道</Trans>;
  const own = pickText(locale, item.detachedLabelJa ?? null, item.detachedLabelEn ?? null);
  if (own) return <span lang={own.lang}>{own.text}</span>;
  if (item.stampFrom) {
    const from = locale === "ja" ? item.stampFrom.nameJa : (item.stampFrom.nameEn ?? item.stampFrom.nameJa);
    return <Trans>{from}から遥拝</Trans>;
  }
  return <Trans>ルート外</Trans>;
}
