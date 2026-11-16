import { useLingui } from "@lingui/react/macro";
import { STAR_COUNT } from "@/lib/grading";

/** A five-star meter ("★★☆☆☆"): the filled stars in the brand colour, read aloud as "5段階中2". */
export function Stars({ n }: { n: number }) {
  const { t } = useLingui();
  return (
    <span role="img" aria-label={t`${STAR_COUNT}段階中${n}`} className="whitespace-nowrap tracking-[0.05em]">
      <span aria-hidden="true" className="text-brand">
        {"★".repeat(n)}
      </span>
      <span aria-hidden="true" className="text-line">
        {"★".repeat(STAR_COUNT - n)}
      </span>
    </span>
  );
}
