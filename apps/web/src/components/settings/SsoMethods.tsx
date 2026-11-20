"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { AuthError } from "@/components/auth/authUi";
import { buttonStyle } from "@/components/button";
import { useReauth } from "@/components/auth/ReauthDialog";
import { SSO_NAMES, SsoMark, useSsoProviders } from "@/components/auth/SsoButtons";
import { confirmDialog } from "@/components/ConfirmDialog";
import { isServerCode } from "@/lib/api-error";
import { listSsoIdentities, removeSsoIdentity, startSso, type SsoIdentityItem } from "@/lib/auth-client";
import type { AuthFailure } from "@/lib/auth-flow";
import { formatDay, japanDay } from "@/lib/format";

/**
 * Google, LINE and Apple on the login-methods screen: which are connected, connect another, or take one off. Connecting
 * leaves for the provider and comes back here with `?sso=linked` or `?sso_error=<code>`.
 */
export function SsoMethods() {
  const { t, i18n } = useLingui();
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

  // One row per provider, connected first (with the day), then the ones this site offers that are not connected yet.
  const rows = [
    ...(items ?? []).map((item) => ({ provider: item.provider, item })),
    ...providers.filter((p) => !items?.some((i) => i.provider === p)).map((provider) => ({ provider, item: null })),
  ];
  return (
    <div className="flex flex-col gap-4">
      <h2 className="border-l-4 border-brand pl-3 font-serif text-xl font-bold text-accent">{t`Google・LINE・Apple`}</h2>
      {linked ? <p className="text-lg font-bold">{t`つなぎました。次からは、このアカウントでもログインできます。`}</p> : null}
      <ul className="flex flex-col gap-3">
        {rows.map(({ provider, item }) => {
          const name = SSO_NAMES[provider];
          const added = item ? formatDay(i18n.locale, japanDay(item.createdAt)) : "";
          return (
            <li key={item?.id ?? provider} className="flex items-center gap-4 rounded-lg bg-surface p-4">
              <span
                className={`flex size-12 shrink-0 items-center justify-center rounded-full ${provider === "line" ? "bg-line-green text-on-line-green" : provider === "google" ? "border border-google-line bg-google" : item ? "bg-ink text-paper" : "border border-ink bg-paper text-ink"}`}
              >
                <SsoMark provider={provider} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xl font-bold leading-snug">{name}</span>
                <span className="block text-lg text-muted">{item ? t`${added} につないだ` : t`まだつないでいません`}</span>
              </span>
              {item ? (
                <button type="button" disabled={busy} onClick={() => void remove(item)} className={buttonStyle("secondary", "sm", "inline-flex shrink-0")}>
                  {t`外す`}
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => void connect(provider)} className={buttonStyle("action", "sm", "inline-flex shrink-0")}>
                  {t`つなぐ`}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <AuthError code={error} />
      {dialog}
    </div>
  );
}
