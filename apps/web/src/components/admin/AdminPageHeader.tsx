import type { ReactNode } from "react";
import { splitIntro } from "@/lib/admin/page-intro";
import { InfoTip } from "./InfoTip";

/**
 * The top of an admin page: the title (with any buttons beside it), then one line about the page; the rest of the
 * explanation waits behind an (i) button (2026-11-18, user: a long-time admin should not scroll past it every visit).
 */
export function AdminPageHeader({ title, intro, children }: { title: ReactNode; intro?: string | null; /** Buttons beside the title. */ children?: ReactNode }) {
  const { summary, more } = splitIntro(intro ?? "");
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{title}</h1>
        {children}
      </div>
      {summary ? <InfoTip label={<p className="text-lg text-muted">{summary}</p>} hint={more} /> : null}
    </div>
  );
}
