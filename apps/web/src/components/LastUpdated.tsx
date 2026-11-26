import { Trans } from "@lingui/react/macro";
import { formatDayTime } from "@/lib/format";

export function LastUpdated({ iso, locale, className = "" }: { iso: string | null | undefined; locale: string; className?: string }) {
  if (!iso) return null;
  const day = formatDayTime(locale, iso);
  return (
    <p className={`text-base text-muted ${className}`}>
      <Trans>最終更新：{day}</Trans>
    </p>
  );
}
