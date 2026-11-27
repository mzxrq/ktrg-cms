import { Trans } from "@lingui/react/macro";
import { pickText } from "@/lib/pick-text";
import type { SpotStatus } from "@/lib/content";
import { formatUpdated } from "@/lib/format";
import { StatusWord } from "./StatusWord";
import { Localized } from "./Localized";

/**
 * The status block on a spot. Open is a calm line. Caution has a thick amber
 * border. Information only is a calm panel (no stamp is offered there). Closed has a striped barrier bar and says plainly that stamps cannot
 * be collected. Neither uses red: vermilion is reserved for the stamp seal.
 */
export function StatusBanner({
  status,
  noteJa,
  noteEn,
  updatedAt,
  locale,
  stampOpen = false,
}: {
  status: SpotStatus;
  noteJa: string | null;
  noteEn: string | null;
  updatedAt: string | null;
  locale: string;
  /** Closed, but its stamp is still collected elsewhere (遥拝, from its open waypoint): no "no stamp" line. */
  stampOpen?: boolean;
}) {
  const note = pickText(locale, noteJa, noteEn);
  const updated = updatedAt ? formatUpdated(locale, updatedAt) : null;

  const details = (
    <>
      {note ? (
        <p className="mt-2 text-lg">
          <Localized value={note} />
        </p>
      ) : null}
      {updated ? (
        <p className="mt-2 text-base text-muted">
          <Trans>更新：{updated}（日本時間）</Trans>
        </p>
      ) : null}
    </>
  );

  if (status === "open") {
    return (
      <section className="px-4">
        <p className="text-xl">
          <StatusWord status="open" />
        </p>
        {details}
      </section>
    );
  }

  if (status === "caution") {
    return (
      <section className="mx-4 rounded-lg border-4 border-caution p-5">
        <p className="text-2xl">
          <StatusWord status="caution" />
        </p>
        {details}
      </section>
    );
  }

  // Information only: the place exists, but it offers no stamp. A calm note, not a barrier: nothing is wrong or blocked.
  if (status === "info") {
    return (
      <section className="mx-4 rounded-lg bg-surface p-4">
        <p className="text-xl">
          <StatusWord status="info" />
        </p>
        <p className="mt-2 text-lg font-bold">
          <Trans>この場所にスタンプ対象外です。</Trans>
        </p>
        {details}
      </section>
    );
  }

  return (
    <section className="mx-4 overflow-hidden rounded-lg border-4 border-ink">
      {/* Barrier stripes: closed reads as "blocked" even at a glance, without red. */}
      <div
        aria-hidden="true"
        className="h-3 bg-[repeating-linear-gradient(135deg,var(--color-ink)_0_12px,var(--color-surface)_12px_24px)]"
      />
      <div className="p-5">
        <p className="text-2xl">
          <StatusWord status="closed" />
        </p>
        {stampOpen ? null : (
          <p className="mt-2 text-lg font-bold">
            <Trans>現在はスタンプを押せません。</Trans>
          </p>
        )}
        {details}
      </div>
    </section>
  );
}
