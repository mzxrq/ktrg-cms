"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useLingui } from "@lingui/react/macro";
import { accountLocale } from "@/i18n/locales";
import { KeyIcon } from "@/components/icons";
import { requestEmailCode, signUpWithPasskey, verifyEmailCode, type SignupProfile } from "@/lib/auth-client";
import { hasName, NAME_MAX, safeNextPath, type AuthFailure } from "@/lib/auth-flow";
import { PrivacyNote } from "@/components/PrivacyNote";
import { AuthError, inputClass, OrDivider, OriginPicker, primaryButton, secondaryButton, type OriginAnswer } from "./authUi";
import { EmailCodeStep } from "./EmailCodeStep";
import { GroupButton, SsoButtons } from "./SsoButtons";

type Step = "start" | "details" | "name" | "origin" | "code";

/** After the address, the email way asks one thing per screen; the mailed number is the last of these. */
const EMAIL_STEPS = 3;

/**
 * Register like logging in, nothing to look for: the email box first, then one group of the same-sized other ways (face
 * or fingerprint, Google, LINE). Email then goes one question at a time, for people who find a long form hard: a name,
 * where you come from, the mailed number. Face or fingerprint is one screen (a name and where you come from) and then the
 * scan. The account is only created at the end.
 */
export function RegisterFlow({ next, loginHref }: { next?: string; loginHref: string }) {
  const { t, i18n } = useLingui();
  const router = useRouter();
  const locale = accountLocale(i18n.locale);
  const [step, setStep] = useState<Step>("start");
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState<OriginAnswer>({ origin: null, place: null });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AuthFailure | null>(null);

  const profile = (): SignupProfile => ({ displayName: name.trim(), origin: origin.origin, originPlace: origin.place, locale });
  // A new account meets the set-up screen first (how big, how the map looks), then goes where it was going.
  const finish = () => {
    const after = safeNextPath(next, "/");
    router.replace(`/welcome?next=${encodeURIComponent(after)}`);
    router.refresh();
  };
  const go = (to: Step) => {
    setError(null);
    setStep(to);
  };

  async function submitPasskey(e: FormEvent) {
    e.preventDefault();
    if (busy || !hasName(name)) return;
    setBusy(true);
    setError(null);
    const result = await signUpWithPasskey(profile());
    if (result.ok) return finish();
    setError(result.code);
    setBusy(false);
  }

  async function sendCode() {
    if (busy || !hasName(name) || !email.includes("@")) return;
    setBusy(true);
    setError(null);
    const result = await requestEmailCode(email.trim(), locale);
    setBusy(false);
    if (result.ok) setStep("code");
    else setError(result.code);
  }

  const nameField = (
    <label className="flex flex-col gap-2 text-lg font-bold">
      {t`お名前`}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="nickname"
        autoFocus
        maxLength={NAME_MAX}
        className={inputClass}
      />
      <span className="text-base font-normal text-muted">{t`ニックネームでもかまいません。`}</span>
    </label>
  );
  const stepCount = (n: number) => <p className="text-lg font-bold text-muted">{n} / {EMAIL_STEPS}</p>;

  if (step === "code") {
    return (
      <div className="flex flex-col gap-6">
        {stepCount(EMAIL_STEPS)}
        <EmailCodeStep
          email={email.trim()}
          locale={locale}
          submitLabel={t`登録する`}
          onBack={() => go("origin")}
          onSubmit={async (code) => {
            const result = await verifyEmailCode(email.trim(), code, profile());
            if (result.ok) finish();
            return result;
          }}
        />
      </div>
    );
  }

  if (step === "name" || step === "origin") {
    const ready = step === "origin" || hasName(name);
    const forward = (e: FormEvent) => {
      e.preventDefault();
      if (!ready) return;
      if (step === "origin") void sendCode();
      else go("origin");
    };
    return (
      <form onSubmit={forward} className="flex flex-col gap-6" noValidate>
        {stepCount(step === "name" ? 1 : 2)}
        {step === "name" ? (
          nameField
        ) : (
          <>
            <OriginPicker value={origin} onChange={setOrigin} />
            <PrivacyNote />
          </>
        )}
        <AuthError code={error} />
        <div className="flex flex-col gap-3">
          <button type="submit" disabled={busy || !ready} className={primaryButton}>
            {step === "origin" ? t`確認番号を送る` : t`つぎへ`}
          </button>
          <button type="button" onClick={() => go(step === "name" ? "start" : "name")} className={secondaryButton}>
            {t`戻る`}
          </button>
        </div>
      </form>
    );
  }

  if (step === "details") {
    return (
      <form onSubmit={submitPasskey} className="flex flex-col gap-6" noValidate>
        {nameField}
        <OriginPicker value={origin} onChange={setOrigin} />
        <PrivacyNote />
        <AuthError code={error} />
        <p className="text-base text-muted">{t`ほかのアプリに保存するときは、表示される画面で選んでください。`}</p>
        <div className="flex flex-col gap-3">
          <button type="submit" disabled={busy || !hasName(name)} className={primaryButton}>
            <KeyIcon />
            {t`顔・指紋で登録する`}
          </button>
          <button type="button" onClick={() => go("start")} className={secondaryButton}>
            {t`戻る`}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (email.includes("@")) go("name");
        }}
        className="flex flex-col gap-4"
        noValidate
      >
        <label className="flex flex-col gap-2 text-lg font-bold">
          {t`メールアドレス`}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            inputMode="email"
            maxLength={254}
            placeholder="name@example.com"
            className={inputClass}
          />
        </label>
        <p className="-mt-2 text-base text-muted">{t`お名前などを聞いたあと、確認番号をメールでお送りします。`}</p>
        <button type="submit" disabled={!email.includes("@")} className={primaryButton}>
          {t`つぎへ`}
        </button>
      </form>
      <OrDivider />
      <SsoButtons returnTo={safeNextPath(next, "/")} signUp>
        <GroupButton icon={<KeyIcon />} label={t`顔・指紋で登録`} onClick={() => go("details")} />
      </SsoButtons>
      <p className="text-lg">
        {t`登録済みの方は`}{" "}
        <Link href={loginHref} className="tap-target inline-flex items-center font-bold text-accent underline underline-offset-4">
          {t`ログイン`}
        </Link>
      </p>
    </div>
  );
}
