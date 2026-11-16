"use client";

import { useLingui } from "@lingui/react/macro";
import { joinCredit, splitCredit } from "@/lib/admin/credit";
import { TextInput } from "./fields";

/** A photo's credit as two boxes side by side: who took it and the license, then the page to link to (optional). 120 + 170 characters keep the joined credit under the API's 300 for a photo. */
export function CreditInput({ id, value, onChange, placeholder }: { id: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const { t } = useLingui();
  const { text, link } = splitCredit(value);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <TextInput id={id} value={text} onChange={(v) => onChange(joinCredit(v, link))} maxLength={120} placeholder={placeholder} ariaLabel={t`出どころの文字`} />
      <TextInput id={`${id}-link`} value={link} onChange={(v) => onChange(joinCredit(text, v))} maxLength={170} placeholder="https://…" ariaLabel={t`出どころのリンク（なくてもよい）`} />
    </div>
  );
}
