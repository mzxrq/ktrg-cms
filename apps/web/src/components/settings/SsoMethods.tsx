"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { AuthError, secondaryButton } from "@/components/auth/authUi";
import { useReauth } from "@/components/auth/ReauthDialog";
import { SSO_NAMES, useSsoProviders } from "@/components/auth/SsoButtons";
import { confirmDialog } from "@/components/ConfirmDialog";
import { isServerCode } from "@/lib/api-error";
import { listSsoIdentities, removeSsoIdentity, startSso, type SsoIdentityItem } from "@/lib/auth-client";
import type { AuthFailure } from "@/lib/auth-flow";

/**
 * Google, LINE and Apple on the login-methods screen: which are connected, connect another, or take one off. Connecting
 * leaves for the provider and comes back here with `?sso=linked` or `?sso_error=<code>`.
 */
export function SsoMethods() {
  const { t } = useLingui();
  const providers = useSsoProviders();
  const [items, setItems] = useState<SsoIdentityItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  // What the provider's trip came back with: read once, then dropped from the address so a reload does not repeat it.
  const query = useSearchParams();
  const [error, setError] = useState<AuthFailure | null>(() => {
    const code = query.get("sso_error");
    return isServerCode(code) ? code : null;
  });
  const [linked, setLinked] = useState(() => query.get("sso") === "linked");
  const { guard, dialog } = useReauth();

  useEffect(() => {
    let live = true;
    const q = new URLSearchParams(window.location.search);
    if (q.has("sso_error") || q.has("sso")) window.history.replaceState(null, "", window.location.pathname);
    void listSsoIdentities().then((res) => live && res.ok && setItems(res.identities));
    return () => {
      live = false;
    };
  }, []);

  if (providers.length === 0 && !items?.length) return null;

  async function connect(provider: (typeof providers)[number]) {
    setBusy(true);
    setError(null);
    const res = await guard(() => startSso(provider, "link", { returnTo: window.location.pathname }));
    // Success leaves the page; anything else stays here.
    if (!res.ok) {
      setError(res.code === "cancelled" ? null : res.code);
      setBusy(false);
    }
  }

  async function remove(item: SsoIdentityItem) {
    const name = SSO_NAMES[item.provider];
    if (busy || !(await confirmDialog({ title: t`${name}のログインを外しますか？`, body: t`ほかの方法では、これまでどおりログインできます。`, yes: t`外す` }))) return;
    setBusy(true);
    setError(null);
    setLinked(false);
    const res = await guard(() => removeSsoIdentity(item.id));
    setBusy(false);
    if (res.ok) setItems((list) => list?.filter((i) => i.id !== item.id) ?? null);
    else setError(res.code === "cancelled" ? null : res.code);
  }

  const connected = new Set(items?.map((i) => i.provider));
  return (
    <div className="flex flex-col gap-4 rounded-[1.75rem] bg-surface p-4">
      <h2 className="border-l-4 border-brand pl-3 font-serif text-xl font-bold text-accent">{t`Google・LINE・Apple`}</h2>
      {linked ? <p className="text-lg font-bold">{t`つなぎました。次からは、このアカウントでもログインできます。`}</p> : null}
      {items?.map((item) => {
        const name = SSO_NAMES[item.provider];
        return (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-lg">{t`${name}でログインできます`}</p>
            <button type="button" disabled={busy} onClick={() => void remove(item)} className={`${secondaryButton} wide:w-auto`}>
              {t`外す`}
            </button>
          </div>
        );
      })}
      {providers
        .filter((p) => !connected.has(p))
        .map((p) => {
          const name = SSO_NAMES[p];
          return (
            <button key={p} type="button" disabled={busy} onClick={() => void connect(p)} className={secondaryButton}>
              {t`${name}とつなぐ`}
            </button>
          );
        })}
      <AuthError code={error} />
      {dialog}
    </div>
  );
}
