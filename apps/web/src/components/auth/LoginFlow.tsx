"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import { accountLocale } from "@/i18n/locales";
import { KeyIcon } from "@/components/icons";
import { logInWithPasskey, logInWithPassword, requestEmailCode, verifyEmailCode } from "@/lib/auth-client";
import { safeNextPath, type AuthFailure } from "@/lib/auth-flow";
import { AuthError, inputClass, OrDivider, primaryButton, textButton } from "./authUi";
import { EmailCodeStep } from "./EmailCodeStep";
import { GroupButton, SsoButtons } from "./SsoButtons";
import { PasswordInput } from "./PasswordInput";

/**
 * Log in on one screen, nothing to look for: the email box first (a number is mailed), the password box only after
 * 「パスワードでログイン」, then one group of the same-sized other ways (face or fingerprint, Google, LINE).
 */
export function LoginFlow({ next, registerHref, ssoError = null }: { next?: string; registerHref: string; ssoError?: AuthFailure | null }) {
  const { t, i18n } = useLingui();
  const router = useRouter();
  const locale = accountLocale(i18n.locale);
  const [codeSent, setCodeSent] = useState(false);
  const [withPassword, setWithPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthFailure | null>(null);
  const [passkeyError, setPasskeyError] = useState<AuthFailure | null>(null);

  const finish = () => {
    router.replace(safeNextPath(next, "/"));
    router.refresh(); // the header and pages now see the session
  };

  async function withPasskey() {
    setBusy(true);
    setPasskeyError(null);
    const result = await logInWithPasskey();
    if (result.ok) return finish();
    setPasskeyError(result.code);
    setBusy(false);
  }

  const ready = email.includes("@") && (!withPassword || password !== "");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    if (withPassword) {
      const result = await logInWithPassword(email.trim(), password);
      if (result.ok) return finish();
      setError(result.code);
    } else {
      const result = await requestEmailCode(email.trim(), locale);
      if (result.ok) setCodeSent(true);
      else setError(result.code);
    }
    setBusy(false);
  }

  if (codeSent) {
    return (
      <EmailCodeStep
        email={email.trim()}
        locale={locale}
        submitLabel={t`ログイン`}
        onBack={() => setCodeSent(false)}
        onSubmit={async (code) => {
          const result = await verifyEmailCode(email.trim(), code);
          if (result.ok) finish();
          return result;
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-2 text-lg font-bold">
          {t`メールアドレス`}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete={withPassword ? "username" : "email"}
            inputMode="email"
            maxLength={254}
            placeholder="name@example.com"
            className={inputClass}
          />
        </label>
        {withPassword ? (
          <PasswordInput label={t`パスワード`} value={password} onChange={setPassword} autoComplete="current-password" autoFocus />
        ) : (
          <p className="-mt-2 text-base text-muted">{t`ログイン用の番号をメールでお送りします。`}</p>
        )}
        <AuthError code={error} />
        <button type="submit" disabled={busy || !ready} className={primaryButton}>
          {withPassword ? t`ログイン` : t`確認番号を送る`}
        </button>
        {/* A forgotten password needs no reset of its own: the mailed number logs in, and the settings set a new one. */}
        <button
          type="button"
          aria-expanded={withPassword}
          onClick={() => {
            setError(null);
            setPassword("");
            setWithPassword(!withPassword);
          }}
          className={textButton}
        >
          {withPassword ? t`パスワードを使わずに、メールでログイン` : t`パスワードでログイン`}
        </button>
      </form>
      <OrDivider />
      <SsoButtons returnTo={safeNextPath(next, "/")} initialError={ssoError}>
        <GroupButton icon={<KeyIcon />} label={t`顔・指紋でログイン`} onClick={() => void withPasskey()} disabled={busy} />
        <AuthError code={passkeyError} />
      </SsoButtons>
      <p className="text-lg">
        {t`はじめての方は`}{" "}
        <Link href={registerHref} className="tap-target inline-flex items-center font-bold text-accent underline underline-offset-4">
          {t`新規登録`}
        </Link>
      </p>
    </div>
  );
}
