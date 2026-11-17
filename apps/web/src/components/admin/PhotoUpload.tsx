"use client";

import { useEffect, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { useErrorMessages } from "@/components/useErrorMessages";
import { errorKeyFromApi, isServerCode, type ErrorKey } from "@/lib/api-error";
import { PhotoLibraryButton } from "./PhotoLibrary";
import { readJson } from "@/lib/read-json";

/** The longest side a site photo needs, in pixels (a phone photo is often 4000 or more). */
const MAX_SIDE = 2400;

/**
 * The photo as a smaller JPEG: at most MAX_SIDE on its longest side. A phone photo of 5 to 10 MB would be refused by the
 * host (it rejects a body over about 4.5 MB before the API sees it), and the new copy also carries no camera data (where
 * and when it was taken). If the browser cannot read the picture, the file is sent as it is and the API decides.
 */
export async function shrinkPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file); // turned upright by its camera data, which is then left behind
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff"; // a transparent PNG would turn black as a JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.88));
    return blob && blob.size > 0 ? new File([blob], file.name.replace(/\.[^.]*$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

/** Send a photo to POST /admin/uploads; its public https link, or why not. */
export async function uploadPhoto(original: File): Promise<{ ok: true; url: string } | { ok: false; key: ErrorKey }> {
  try {
    const file = await shrinkPhoto(original);
    const form = new FormData();
    form.set("file", file);
    const res = await fetch("/api/v1/admin/uploads", { method: "POST", credentials: "same-origin", body: form });
    const json = await readJson<{ ok?: unknown; error?: unknown; upload?: { url?: unknown } }>(res);
    if (res.ok && json?.ok === true && typeof json.upload?.url === "string") return { ok: true, url: json.upload.url };
    return { ok: false, key: json?.ok === false && isServerCode(json.error) ? json.error : errorKeyFromApi(res.status, json) };
  } catch {
    return { ok: false, key: "network" };
  }
}

/**
 * A "choose a photo" button for the box next to it: the file goes to the photo storage and `onUploaded` gets its https link.
 * Beside it, a button for the photo library: a photo uploaded before can be picked again instead of uploaded twice.
 *
 * With `onUploadedMany`, several files can be chosen at once (a waypoint's photo list). They are sent one after another (each
 * is shrunk in the browser first, and the host refuses big bodies) and the links come back together, once, in the order chosen,
 * so the caller adds them in one change. A file that fails is left out and its error shown; the others still come back. Only
 * the first `limit` files are sent.
 */
export function PhotoUpload({
  onUploaded,
  onUploadedMany,
  limit = Infinity,
  disabled = false,
}: {
  onUploaded: (url: string) => void;
  onUploadedMany?: (urls: string[]) => void;
  limit?: number;
  disabled?: boolean;
}) {
  const { t } = useLingui();
  const messages = useErrorMessages();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [skipped, setSkipped] = useState(0);
  const busy = progress !== null;
  // The links go to the newest callback, not the one from when the files were chosen: the list may change while they upload.
  const latest = useRef({ onUploaded, onUploadedMany });
  useEffect(() => {
    latest.current = { onUploaded, onUploadedMany };
  });

  async function send(chosen: File[]) {
    const files = chosen.slice(0, Math.max(0, limit));
    setSkipped(chosen.length - files.length);
    if (files.length === 0) return;
    setError(null);
    const urls: string[] = [];
    for (const [i, file] of files.entries()) {
      setProgress({ done: i, total: files.length });
      const res = await uploadPhoto(file);
      if (res.ok) urls.push(res.url);
      else setError(res.key);
    }
    setProgress(null);
    const { onUploaded: one, onUploadedMany: many } = latest.current;
    if (many) {
      if (urls.length > 0) many(urls);
    } else if (urls[0]) one(urls[0]);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <label className="tap-target inline-flex w-fit cursor-pointer items-center rounded-full border border-line px-5 text-lg font-bold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-accent has-[:disabled]:opacity-40">
          {progress ? (progress.total > 1 ? t`送っています… ${progress.done + 1}/${progress.total}` : t`送っています…`) : onUploadedMany ? t`写真をアップロード（まとめて選べます）` : t`写真をアップロード`}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple={onUploadedMany !== undefined}
            disabled={busy || disabled}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = ""; // the same files can be chosen again
              void send(files);
            }}
            className="sr-only"
          />
        </label>
        <PhotoLibraryButton onPicked={onUploaded} disabled={busy || disabled} />
      </div>
      {error ? (
        <p role="alert" className="text-base font-bold text-danger">
          {messages[error]}
        </p>
      ) : null}
      {skipped > 0 ? (
        <p role="status" className="text-base font-bold">
          {t`${skipped}枚は、写真の数の上限を超えるので送りませんでした。`}
        </p>
      ) : null}
    </div>
  );
}
