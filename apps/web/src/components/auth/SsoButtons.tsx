"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ssoProviders, startSso, type SsoProvider } from "@/lib/auth-client";
import type { AuthFailure } from "@/lib/auth-flow";
import { AuthError, ChoiceCard } from "./authUi";

/** Brand names, the same in every language. */
export const SSO_NAMES: Record<SsoProvider, string> = { google: "Google", line: "LINE", apple: "Apple" };

/** LINE's official icon (public/sso/line-icon.png, from LINE's button kit) as a mask, so it takes the text colour. */
export const LineIcon = ({ className = "size-10" }: { className?: string }) => (
  <span aria-hidden="true" className={`block shrink-0 bg-current [mask:url(/sso/line-icon.png)_center/contain_no-repeat] ${className}`} />
);

/** The mark in a provider's circle. shortcut: Google and Apple show their first letter; use their official artwork before launch. */
export const SsoMark = ({ provider }: { provider: SsoProvider }) =>
  provider === "line" ? <LineIcon /> : <span className="text-2xl font-bold">{SSO_NAMES[provider][0]}</span>;

/**
 * LINE's login button by its guidelines (developers.line.biz, LINE Login button): #06C755 with the white icon, a divider
 * of black at 8%, white words on one line; hover adds black at 10%, press 30%; disabled is white with #1E1E1E at 20% and a
 * #E5E5E5 (60%) border. The height and corners match the other login choices.
 */
function LineLoginButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="tap-target group relative flex min-h-[5rem] w-full items-stretch overflow-hidden rounded-full bg-line-green text-on-line-green disabled:border disabled:border-[#e5e5e5]/60 disabled:bg-white disabled:text-[#1e1e1e]/20"
    >
      <span aria-hidden="true" className="absolute inset-0 group-enabled:group-hover:bg-black/10 group-enabled:group-active:bg-black/30" />
      <span className="relative flex items-center border-r border-black/8 pr-4 pl-6 group-disabled:border-[#e5e5e5]/60">
        <LineIcon className="size-12" />
      </span>
      <span className="relative flex flex-1 items-center justify-center px-6 text-xl font-bold whitespace-nowrap">{label}</span>
    </button>
  );
}

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
        if (p === "line") return <LineLoginButton key={p} label={t`${name}でログイン`} onClick={() => void go(p)} disabled={busy} />;
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
