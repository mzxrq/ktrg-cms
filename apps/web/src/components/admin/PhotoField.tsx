"use client";

import type { ReactNode } from "react";
import { useLingui } from "@lingui/react/macro";
import { PhotoLinkDetails } from "./PhotoLinkDetails";
import { PhotoSlot } from "./PhotoSlot";
import { PhotoUpload } from "./PhotoUpload";
import { TextInput } from "./fields";

/** A short name for a photo link: the file's name (decoded), not the whole address. */
export function photoName(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const last = parts.at(-1) ?? "";
    // A Wikimedia thumbnail ends in "<width>px-<file>"; the file's own name is the segment before it.
    const file = /^\d+px-/.test(last) && parts.length > 1 ? parts.at(-2)! : last;
    return decodeURIComponent(file).replace(/_/g, " ");
  } catch {
    return url;
  }
}

/**
 * One photo, laid out like a row of a waypoint's photo list (PhotoListEditor): the picture small on the left, and beside it
 * its file name, the upload and library buttons, the link folded away, anything the caller adds (a credit), and 外す.
 * `id` goes on the link box, for the field's label. The link box opens by itself when `invalid`.
 */
export function PhotoField({ id, url, onChange, invalid = false, disabled = false, children }: { id: string; url: string; onChange: (url: string) => void; invalid?: boolean; disabled?: boolean; children?: ReactNode }) {
  const { t } = useLingui();
  const has = url.trim() !== "";
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-3 sm:flex-row">
      <PhotoSlot url={url} className="sm:w-40 sm:shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {has ? (
          <p className="truncate text-base font-bold" title={url}>
            {photoName(url)}
          </p>
        ) : null}
        <PhotoUpload onUploaded={onChange} disabled={disabled} />
        <PhotoLinkDetails open={invalid}>
          <TextInput id={id} value={url} onChange={onChange} maxLength={500} placeholder="https://" invalid={invalid} />
        </PhotoLinkDetails>
        {children}
        {has ? (
          <button type="button" disabled={disabled} onClick={() => onChange("")} className="tap-target w-fit rounded-full border border-danger px-4 text-base font-bold text-danger disabled:opacity-40">
            {t`外す`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
