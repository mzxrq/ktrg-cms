"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useLingui } from "@lingui/react/macro";
import { ChevronDownIcon, ChevronUpIcon, MoonIcon, SunIcon } from "@/components/icons";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { logOut } from "@/lib/auth-client";
import { parseTheme, themeCookieString } from "@/lib/theme";

// Who is signed in, and everything about their own account, behind one button (2026-11-18, user): at the foot of the menu on
// a wide screen, in the top bar on a phone. Closed until tapped; tapping again closes it. It pops up over the page (2026-11-20,
// user: opening inside the menu looked ugly), placed from the button so neither the menu's scrolling nor the folded rail cuts
// it off: upward at the foot of the menu, downward from the top bar. Password change is not offered
// (admins and editors cannot have one); secrets and API keys come later.

const subscribe = (onChange: () => void) => {
  window.addEventListener("admin-theme-changed", onChange);
  return () => window.removeEventListener("admin-theme-changed", onChange);
};
/** The admin screens are light unless dark was chosen; they never follow the device (2026-11-18, admin only). */
const readDark = () => document.documentElement.dataset.theme === "dark";

/** Light by default on the admin screens; leaving them hands "auto" back to the visitor pages. */
export function useAdminLightDefault() {
  useLayoutEffect(() => {
    const html = document.documentElement;
    if (!html.dataset.theme) html.dataset.theme = "light";
    return () => {
      if (parseTheme(document.cookie) === "auto") delete html.dataset.theme;
    };
  }, []);
}

export function AdminProfileMenu({ name, role }: { name: string | null; role: "editor" | "admin" | null }) {
  const { t } = useLingui();
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState(false);
  const [place, setPlace] = useState<CSSProperties>({});
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const toggle = () => {
    const r = button.current?.getBoundingClientRect();
    if (!open && r) {
      const width = Math.min(288, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const upward = r.top > window.innerHeight / 2;
      setPlace(upward ? { left, width, bottom: window.innerHeight - r.top + 8 } : { left, width, top: r.bottom + 8 });
    }
    setOpen(!open);
  };

  // While open: a tap outside, Escape, or a change of window size closes it (Escape puts focus back on the button).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!panel.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  const router = useRouter();
  const id = useId();
  const dark = useSyncExternalStore(subscribe, readDark, () => false);
  useAdminLightDefault();

  const setDark = (on: boolean) => {
    document.cookie = themeCookieString(on ? "dark" : "light", window.location.protocol === "https:");
    document.documentElement.dataset.theme = on ? "dark" : "light";
    window.dispatchEvent(new Event("admin-theme-changed"));
  };
  const signOut = async () => {
    await logOut();
    router.push("/");
    router.refresh(); // the signed-out page, not a cached signed-in one
  };
  const shown = name ?? (role === "admin" ? t`管理者` : t`編集者`);
  const row = "tap-target flex items-center rounded-full px-4 text-lg font-bold hover:bg-surface";

  return (
    <div className="lg:w-full">
      <button ref={button} type="button" aria-expanded={open} aria-controls={id} onClick={toggle} className="tap-target flex items-center gap-2 rounded-full border border-line px-2 pr-3 text-left hover:bg-surface lg:w-full">
        <span aria-hidden className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-selected text-lg font-bold text-on-selected">
          {shown.slice(0, 1)}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight lg:group-data-[folded=true]:sr-only">
          <span className="truncate text-base font-bold">{shown}</span>
          <span className="text-base text-muted">{role === "admin" ? t`管理者` : t`編集者`}</span>
        </span>
        <span className="lg:group-data-[folded=true]:hidden">{open ? <ChevronUpIcon size={20} /> : <ChevronDownIcon size={20} />}</span>
      </button>
      {open ? (
        <div ref={panel} id={id} style={place} className="fixed z-50 flex max-h-[80vh] flex-col gap-1 overflow-y-auto rounded-2xl border border-line bg-paper p-2 shadow-xl">
          <Link href="/" className={row} onClick={() => setOpen(false)}>
            {t`サイトのトップへ`}
          </Link>
          <button type="button" aria-expanded={account} onClick={() => setAccount(!account)} className={`${row} justify-between text-left`}>
            {t`アカウントの設定`}
            {account ? <ChevronUpIcon size={20} /> : <ChevronDownIcon size={20} />}
          </button>
          {account ? (
            <div className="flex flex-col gap-1 pl-3">
              <Link href="/profile" className={row} onClick={() => setOpen(false)}>
                {t`プロフィール（名前・写真）`}
              </Link>
              <Link href="/settings" className={row} onClick={() => setOpen(false)}>
                {t`見やすさの設定`}
              </Link>
              <Link href="/settings/passkeys" className={row} onClick={() => setOpen(false)}>
                {t`顔・指紋のログイン`}
              </Link>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 px-2 py-1">
            <LocaleSwitcher />
            <button type="button" aria-pressed={dark} onClick={() => setDark(!dark)} className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-line px-3.5 text-base font-bold hover:bg-surface [&>svg]:size-5">
              {dark ? <MoonIcon /> : <SunIcon />}
              {dark ? t`ダーク` : t`ライト`}
            </button>
          </div>
          <button type="button" onClick={() => void signOut()} className={`${row} text-left text-danger`}>
            {t`ログアウト`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
