"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ssoProviders, startSso, type SsoProvider } from "@/lib/auth-client";
import type { AuthFailure } from "@/lib/auth-flow";
import { AuthError } from "./authUi";

/** Brand names, the same in every language. */
export const SSO_NAMES: Record<SsoProvider, string> = { google: "Google", line: "LINE", apple: "Apple" };

/** LINE's official icon (public/sso/line-icon.png, from LINE's button kit) as a mask, so it takes the text colour. */
export const LineIcon = ({ className = "size-10" }: { className?: string }) => (
  <span aria-hidden="true" className={`block shrink-0 bg-current [mask:url(/sso/line-icon.png)_center/contain_no-repeat] ${className}`} />
);

/** Google's own "G" (public/sso/google-g.png, cut from Google's sign-in kit): always in its colours, always on white. */
export const GoogleG = ({ className = "size-6" }: { className?: string }) => (
  // eslint-disable-next-line @next/next/no-img-element -- a fixed 5 KB brand mark; next/image adds nothing here
  <img src="/sso/google-g.png" alt="" aria-hidden="true" className={`block shrink-0 ${className}`} />
);

/** The mark in a provider's circle. shortcut: Apple shows its first letter; use Apple's official artwork before launch. */
export const SsoMark = ({ provider }: { provider: SsoProvider }) =>
  provider === "line" ? (
    <LineIcon />
  ) : provider === "google" ? (
    <GoogleG className="size-7" />
  ) : (
    <span className="text-2xl font-bold">{SSO_NAMES[provider][0]}</span>
  );

/** One size for every button in the sign-in group (face or fingerprint, Google, LINE): Google asks for equal weight. */
const groupButton = "tap-target group relative flex min-h-14 w-full items-stretch overflow-hidden rounded-xl text-lg font-bold disabled:opacity-60";
const groupIcon = "relative flex w-14 shrink-0 items-center justify-center";
// The words sit in the middle of the whole button: the right padding matches the icon's width.
const groupLabel = "relative flex flex-1 items-center justify-center pr-14 pl-2 text-center leading-snug";

/** A button in the sign-in group with a plain outline (face or fingerprint, and Apple until it has its own look). */
export function GroupButton({ icon, label, onClick, disabled }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${groupButton} border border-ink bg-surface text-ink hover:bg-paper`}>
      <span className={`${groupIcon} [&_svg]:size-6`}>{icon}</span>
      <span className={groupLabel}>{label}</span>
    </button>
  );
}

/**
 * Google's sign-in button by its guidelines (developers.google.com/identity/branding-guidelines), the light theme in both
 * of our themes so the G stays on white: fill #FFFFFF, a 1px #747775 edge, words #1F1F1F, the standard G unchanged.
 * Google asks for Google Sans; we keep the app's own font (no web fonts). Scaled up as a whole, the same size as LINE's.
 */
function GoogleLoginButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${groupButton} border border-google-line bg-google text-on-google`}>
      <span aria-hidden="true" className="absolute inset-0 group-enabled:group-hover:bg-on-google/8 group-enabled:group-active:bg-on-google/12" />
      <span className={groupIcon}>
        <GoogleG />
      </span>
      <span className={groupLabel}>{label}</span>
    </button>
  );
}

/**
 * LINE's login button by its guidelines (developers.line.biz, LINE Login button): #06C755 with the white icon, a divider
 * of black at 8%, white words on one line; hover adds black at 10%, press 30%; disabled is white with #1E1E1E at 20% and a
 * #E5E5E5 (60%) border. The same size as the other buttons in the group.
 */
function LineLoginButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="tap-target group relative flex min-h-14 w-full items-stretch overflow-hidden rounded-xl bg-line-green text-lg font-bold text-on-line-green disabled:border disabled:border-[#e5e5e5]/60 disabled:bg-white disabled:text-[#1e1e1e]/20"
    >
      <span aria-hidden="true" className="absolute inset-0 group-enabled:group-hover:bg-black/10 group-enabled:group-active:bg-black/30" />
      <span className="relative flex w-14 shrink-0 items-center justify-center border-r border-black/8 group-disabled:border-[#e5e5e5]/60">
        <LineIcon className="size-9" />
      </span>
      <span className="relative flex flex-1 items-center justify-center pr-14 pl-2 whitespace-nowrap">{label}</span>
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
 * The sign-in group: `children` first (the face or fingerprint button), then Google, LINE or Apple when the site has them
 * set up, all one size. A provider also signs up on the first visit. `returnTo` is where the visitor lands afterwards;
 * `initialError` is a problem the provider's trip came back with.
 */
export function SsoButtons({
  returnTo,
  initialError = null,
  signUp = false,
  children,
}: {
  returnTo?: string;
  initialError?: AuthFailure | null;
  /** On the register page the buttons say 登録 (the trip is the same: a first visit makes the account). */
  signUp?: boolean;
  children?: ReactNode;
}) {
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

  return (
    <div className="flex flex-col gap-3">
      {children}
      {providers.map((p) => {
        const name = SSO_NAMES[p];
        const label = signUp ? t`${name}で登録` : t`${name}でログイン`;
        if (p === "google") return <GoogleLoginButton key={p} label={label} onClick={() => void go(p)} disabled={busy} />;
        if (p === "line") return <LineLoginButton key={p} label={label} onClick={() => void go(p)} disabled={busy} />;
        return <GroupButton key={p} icon={<SsoMark provider={p} />} label={label} onClick={() => void go(p)} disabled={busy} />;
      })}
      <AuthError code={error} />
      {providers.length > 0 ? (
        <p className="text-base leading-7">
          <Trans>
            はじめての方は、そのままアカウントがつくられます。メールアドレスが届いたときは、ログインできなくなったときのためだけに使います。くわしくは
            <Link href="/privacy" className="font-bold underline">
              プライバシーポリシー
            </Link>
            をご覧ください。
          </Trans>
        </p>
      ) : null}
    </div>
  );
}
