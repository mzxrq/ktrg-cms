"use client";

import Link from "next/link";
import { Trans } from "@lingui/react/macro";

/**
 * One plain sentence next to every question about the person: what the answers are used for, that they are
 * optional, and where the full policy is. Shown wherever we ask (register, the about-you step, the profile).
 */
export function PrivacyNote() {
  return (
    <p className="rounded-lg bg-surface p-4 text-base leading-7">
      <Trans>
        ご入力いただいた情報は、利用状況の把握のみに使用し、個人を特定できない形で集計します。詳しくは
        <Link href="/privacy" className="font-bold underline">
          プライバシーポリシー
        </Link>
        をご覧ください。（回答は任意です）
      </Trans>
    </p>
  );
}
