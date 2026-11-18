"use client";

import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { buttonStyle } from "@/components/button";

type State = "checking" | "ok" | "down" | "unknown";
type Result = { api: State; db: State; at: Date };

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
  const check = () => {
    setResult(null);
    void checkAll().then(setResult);
  };

  // Once on opening (the rows start as 確認中…).
  useEffect(() => {
    void checkAll().then(setResult);
  }, []);

  const word: Record<State, string> = { checking: t`確認中…`, ok: t`動いています`, down: t`止まっています`, unknown: t`確認できません（この端末がインターネットにつながっていません）` };
  const mark: Record<State, string> = { checking: "…", ok: "✓", down: "✕", unknown: "?" };
  const rows = [
    { name: t`サイトとサーバー`, state: api },
    { name: t`データベース（スタンプ、ログイン、内容）`, state: db },
  ];

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-3 rounded-[1.75rem] bg-surface p-5" aria-live="polite">
        {rows.map((r) => (
          <div key={r.name} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <dt className="text-lg font-bold">{r.name}</dt>
            <dd className={`text-lg font-bold ${r.state === "down" ? "text-danger" : ""}`}>
              <span aria-hidden="true">{mark[r.state]} </span>
              {word[r.state]}
            </dd>
          </div>
        ))}
      </dl>
      {at ? <p className="text-base text-muted">{t`確認した時刻：${at.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo" })}（日本時間）`}</p> : null}
      <button type="button" onClick={check} disabled={api === "checking" || db === "checking"} className={buttonStyle("secondary", "md", "inline-flex self-start items-center tap-target")}>
        {t`もう一度確認する`}
      </button>
    </div>
  );
}
