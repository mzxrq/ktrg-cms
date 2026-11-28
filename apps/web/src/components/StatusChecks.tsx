"use client";

import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { buttonStyle } from "@/components/button";

type State = "checking" | "ok" | "down" | "unknown";
type Result = { api: State; db: State; at: Date };

const TONE: Record<State, { badge: string; text: string }> = {
  checking: {
    badge: "bg-line/50 text-muted motion-safe:animate-pulse",
    text: "text-muted",
  },
  ok: {
    badge: "bg-moss text-paper",
    text: "text-moss",
  },
  down: {
    badge: "bg-danger text-paper",
    text: "text-danger",
  },
  unknown: {
    badge: "border-2 border-caution bg-paper text-ink",
    text: "text-ink",
  },
};

async function ask(path: string, field: "status" | "database"): Promise<State> {
  try {
    const res = await fetch(`/api/v1/${path}`, { cache: "no-store" });
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return body?.[field] === "ok" ? "ok" : "down";
  } catch {
    return "unknown"; // this device has no connection: says nothing about the site
  }
}

/** The API first; the database only when the API answered (the API is the one that asks it). */
async function checkAll(): Promise<Result> {
  const api = await ask("health", "status");
  const db = api === "ok" ? await ask("health/db", "database") : api;
  return { api, db, at: new Date() };
}

/** Asks the API whether it and its database answer, once on opening and again on the button. Nothing runs in the background. */
export function StatusChecks() {
  const { t } = useLingui();
  const [result, setResult] = useState<Result | null>(null);
  const api = result?.api ?? "checking";
  const db = result?.db ?? "checking";
  const at = result?.at ?? null;
  const checkedAt = at ? at.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo" }) : "";
  const check = () => {
    setResult(null);
    void checkAll().then(setResult);
  };

  // Once on opening (the rows start as 確認中…).
  useEffect(() => {
    void checkAll().then(setResult);
  }, []);

  const word: Record<State, string> = {
    checking: t`確認中…`,
    ok: t`正常に稼働中`,
    down: t`停止中`,
    unknown: t`確認できません（インターネットに接続されていません）`,
  };
  const mark: Record<State, string> = { checking: "…", ok: "✓", down: "✕", unknown: "?" };
  const rows = [
    { name: t`サイト・サーバー`, state: api },
    { name: t`データベース（スタンプ・ログイン・各種データ）`, state: db },
  ];

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-3 rounded-lg bg-surface p-5" aria-live="polite">
        {rows.map((r) => (
          <div key={r.name} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <dt className="text-lg font-bold">{r.name}</dt>
            <dd className={`inline-flex items-center gap-2 text-lg font-bold ${TONE[r.state].text}`}>
              <span
                aria-hidden="true"
                className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-bold leading-none ${TONE[r.state].badge}`}
              >
                {mark[r.state]}
              </span>
              <span>{word[r.state]}</span>
            </dd>
          </div>
        ))}
      </dl>
      {at ? <p className="text-base text-muted">{t`確認時刻：${checkedAt}（日本時間）`}</p> : null}
      <button type="button" onClick={check} disabled={api === "checking" || db === "checking"} className={buttonStyle("secondary", "md", "inline-flex self-start items-center tap-target")}>
        {t`再確認する`}
      </button>
    </div>
  );
}