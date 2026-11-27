import { Trans } from "@lingui/react/macro";
import type { Picked } from "@/lib/pick-text";
import { RichText } from "./RichText";

const heading = "border-l-4 border-brand pl-3 font-serif text-xl font-bold text-accent";

/**
 * A place's words: 説明, 歴史・由来 and 出典, with links and notes (RichText) and the "Japanese only" line. The one copy, for
 * the place's own page (SpotSheet) and the rally's book page (RallyBook), so both read the same (2026-11-27, user).
 */
export function SpotText({ description, history, source = null, className = "px-4", level = 2 }: { description: Picked | null; history: Picked | null; source?: Picked | null; className?: string; /** 3 inside a panel that has its own h2. */ level?: 2 | 3 }) {
  const H = level === 3 ? "h3" : "h2";
  return (
    <>
      {description ? (
        <section className={className}>
          <H className={heading}>
            <Trans>説明</Trans>
          </H>
          {/* Editors type plain text; line breaks are kept. Never raw HTML. */}
          <div className="mt-2 max-w-prose whitespace-pre-line text-lg leading-8">
            <RichText text={description.text} lang={description.lang} />
          </div>
          {description.fallback ? (
            <p className="mt-2 text-base text-muted">
              <Trans>この説明は日本語のみです。</Trans>
            </p>
          ) : null}
        </section>
      ) : null}

      {history ? (
        <section className={className}>
          <H className={heading}>
            <Trans>歴史・由来</Trans>
          </H>
          <div className="mt-2 max-w-prose whitespace-pre-line text-lg leading-8">
            <RichText text={history.text} lang={history.lang} />
          </div>
          {history.fallback ? (
            <p className="mt-2 text-base text-muted">
              <Trans>この説明は日本語のみです。</Trans>
            </p>
          ) : null}
        </section>
      ) : null}

      {source ? (
        <section className={className}>
          <H className={heading}>
            <Trans>出典</Trans>
          </H>
          <div className="mt-2 max-w-prose whitespace-pre-line text-base leading-7 text-muted">
            <RichText text={source.text} lang={source.lang} />
          </div>
        </section>
      ) : null}
    </>
  );
}
