"use client";

import { useLingui } from "@lingui/react/macro";
import { FileVideoPlayer } from "@/components/FileVideo";
import { IntroVideo } from "@/components/IntroVideo";
import { parseVideoFile, parseVideoUrl } from "@/lib/video";

/**
 * The video as visitors will see it, before the course is published. Drawn only from a link that has passed the same checks
 * as the course page (YouTube, or our own upload); anything else shows nothing, so a typed link is never put in a frame as is.
 */
export function VideoPreview({ url, title, subtitles, language }: { url: string; title: string; subtitles: boolean; language: "ja" | "en" }) {
  const { t } = useLingui();
  const video = parseVideoUrl(url);
  const file = video ? null : parseVideoFile(url);
  if (!video && !file) return null;
  return (
    <figure className="flex max-w-xl flex-col gap-2">
      <figcaption className="text-base font-bold">{t`プレビュー（利用者に見える動画）`}</figcaption>
      {video ? <IntroVideo video={video} title={title} /> : file ? <FileVideoPlayer key={file.src} video={file} subtitles={subtitles} language={language} version={null} title={title} /> : null}
    </figure>
  );
}
