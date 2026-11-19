"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ssoProviders, startSso, type SsoProvider } from "@/lib/auth-client";
import type { AuthFailure } from "@/lib/auth-flow";
import { AuthError, ChoiceCard } from "./authUi";

/** Brand names, the same in every language. */
export const SSO_NAMES: Record<SsoProvider, string> = { google: "Google", line: "LINE", apple: "Apple" };

/** The first letter in the tile's circle. shortcut: no brand logos yet; use each provider's official button artwork before launch. */
export const SsoMark = ({ provider }: { provider: SsoProvider }) => <span className="text-2xl font-bold">{SSO_NAMES[provider][0]}</span>;

/** The providers this site has set up ([] until known, and when there are none). */
export function useSsoProviders(): SsoProvider[] {
  const [providers, setProviders] = useState<SsoProvider[]>([]);
  useEffect(() => {
    let live = true;
    void ssoProviders().then((list) => live && setProviders(list));
    return () => {
      live = false;
    };
  }, []);
  return providers;
}

/**
 * Sign in (or, on the first visit, sign up) with Google, LINE or Apple. Nothing shows when the site has none set up.
 * `returnTo` is where the visitor lands afterwards; `initialError` is a problem the provider's trip came back with.
 */
export function SsoButtons({ returnTo, initialError = null }: { returnTo?: string; initialError?: AuthFailure | null }) {
  const { t, i18n } = useLingui();
  const providers = useSsoProviders();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthFailure | null>(initialError);

  async function go(provider: SsoProvider) {
    setBusy(true);
    setError(null);
    const result = await startSso(provider, "login", { returnTo, locale: i18n.locale === "en" ? "en" : "ja" });
    // On success the page is leaving for the provider; stay busy so nobody presses twice.
    if (!result.ok) {
      setError(result.code);
      setBusy(false);
    }
  }

  if (providers.length === 0) return <AuthError code={error} />;
  return (
    <div className="flex flex-col gap-4">
      {providers.map((p) => {
        const name = SSO_NAMES[p];
        return <ChoiceCard key={p} icon={<SsoMark provider={p} />} title={t`${name}でログイン`} onClick={() => void go(p)} disabled={busy} />;
      })}
      <AuthError code={error} />
      <p className="text-base leading-7">
        <Trans>
          はじめての方は、そのままアカウントがつくられます。メールアドレスが届いたときは、ログインできなくなったときのためだけに使います。くわしくは
          <Link href="/privacy" className="font-bold underline">
            プライバシーポリシー
          </Link>
          をご覧ください。
        </Trans>
      </p>
    </div>
  );
}
