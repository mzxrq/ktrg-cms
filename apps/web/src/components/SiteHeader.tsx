"use client";

import { getOutbox } from "@/lib/stamp-outbox";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLingui } from "@lingui/react/macro";
import { logOut } from "@/lib/auth-client";
import { clearSavedPages } from "@/lib/offline-pack";
import {
  BookmarkIcon,
  ChevronIcon,
  DocumentIcon,
  ShopIcon,
  ChevronLeftIcon,
  CloseIcon,
  GearIcon,
  HomeIcon,
  MapIcon,
  RouteIcon,
  StampIcon,
} from "./icons";
import { panelGround } from "./TabBar";
import { WIDE_QUERY } from "@/lib/screen";
import { ProfileCard, type ProfileCardProps } from "./ProfileCard";
import { KatsuragiLogo } from "./KatsuragiLogo";
import { LocaleSelect, LocaleSwitcher } from "./LocaleSwitcher";
import { foundationEn, foundationJa } from "@/lib/terms-content";
import { useMenu } from "./MenuProvider";
import { usePresence } from "@/lib/motion";
import { SampleNoticeButton } from "./SampleNotice";
import { ThemeSwitcher } from "./ThemeSwitcher";
import { confirmDialog } from "@/components/ConfirmDialog";
import { buttonStyle } from "@/components/button";

const barButton =
  "inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-ink bg-paper px-2.5 text-base font-bold text-ink hover:bg-surface [&>svg]:size-6";

// The four tab pages: nothing is "behind" them, so the bar has no back button there.
const TOP_LEVEL = /^\/(map|routes|rallies)?\/?$/;

/** Where "back" goes when this visit has no earlier page of the site to return to (a link opened from outside). */
const parentOf = (pathname: string) =>
  pathname.startsWith("/routes/")
    ? "/routes"
    : pathname.startsWith("/spots/")
      ? "/map"
      : "/";

/**
 * The top bar: a back button on the left (where a thumb expects it), the logo in the middle and the data-notice
 * button on the right. The menu is the last item of the tab bar at the bottom; it holds everything that used to
 * crowd the bar (theme, language, sign in or the profile). On a phone it opens as a panel dropping down from the
 * top; from 768 px it is a popover beside the rail's menu button. While it is open the notice button is hidden.
 *
 * On the home page for someone who is signed out the bar takes no room and stays out of sight at first, so the
 * banner and the title get the whole top of the screen (the register and login buttons are right there). It
 * fades in once the visitor has scrolled a little, floating over the page. It never appears on a timer: a
 * button that shows up by itself moves under the finger. On the map page the bar floats over the map, always, with no
 * background of its own: just the menu button, the logo and the notice button, so the map has the whole screen.
 */
export function SiteHeader({
  signedIn,
  staff = false,
  profile,
  locale,
  sample,
}: {
  signedIn: boolean;
  /** An editor or admin: the menu has a link to the admin area (the server still checks the role there). */
  staff?: boolean;
  profile: Omit<ProfileCardProps, "locale">;
  locale: string;
  sample: boolean;
}) {
  const { t } = useLingui();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const { open, setOpen, railButton } = useMenu();
  const [leaving, setLeaving] = useState(false);
  // Whether this visit has moved between pages yet: then "back" is the browser's own, else it goes to the page's parent.
  const moved = useRef(false);
  const first = useRef(pathname);
  useEffect(() => {
    if (pathname !== first.current) moved.current = true;
  }, [pathname]);
  const goBack = () =>
    moved.current ? router.back() : router.push(parentOf(pathname));
  const onMap = /^\/map\/?$/.test(pathname);
  // The lists that carry their title up in the bar beside the logo (the page itself has no heading on a phone).
  const barTitle = /^\/routes\/?$/.test(pathname)
    ? t`葛城修験の道のり`
    : /^\/rallies\/?$/.test(pathname)
      ? t`スタンプラリー`
      : /^\/bookmarks\/?$/.test(pathname)
        ? t`ブックマーク`
        : /^\/blog\/?$/.test(pathname)
          ? t`ブログ`
          : null;
  const onRoutes = barTitle !== null;
  const onLanding = onMap || (!signedIn && pathname === "/");
  // The logo bar of the signed-out home page shows only while the menu is open: scrolling never brings it over the page.
  const hidden = onLanding && !onMap && !open;
  // 768 px and up: the menu is a drawer beside the rail, and the page behind it may scroll.
  const wide = () => window.matchMedia("(min-width: 768px)").matches;
  // The panel and the dimmed backdrop stay on screen while they leave (motion level permitting), then go.
  const { mounted: panelMounted, ref: panelRef } = usePresence<HTMLDivElement>(
    open,
    () => (wide() ? "pop" : "drop"),
  );
  const { mounted: backdropMounted, ref: backdropRef } =
    usePresence<HTMLDivElement>(open, "fade");

  // The menu is a drawer the full height of the screen, flush against the rail's edge, so it reads as part of the
  // navigation rather than a card floating over the page (2026-11-19). A resize would leave it in the wrong place, so it
  // closes instead.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const anchor = railButton.current;
    if (!open || !panel || !anchor || !wide()) return;
    // On a desktop it starts at the sidebar's edge (the nav fills the sidebar); a tablet has no sidebar, so it slides in
    // from the left edge of the screen.
    panel.style.left = window.matchMedia(WIDE_QUERY).matches
      ? `${(anchor.closest("[data-tabbar]") ?? anchor).getBoundingClientRect().right}px`
      : "0px";
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [open, railButton, setOpen, panelRef]);

  // While the menu is open on a phone the page behind it must not scroll: only the menu does.
  useEffect(() => {
    if (!open || wide()) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape closes it and puts focus back on the button; focus moves into the panel when it opens.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      railButton.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen, railButton, panelRef]);

  // After signing in the visitor comes back to where they were (login and register pages excepted).
  const here = /\/(login|register)(\/|$)/.test(pathname)
    ? ""
    : `?next=${encodeURIComponent(pathname)}`;
  const loginHref = `/login${here}`;
  const registerHref = `/register${here}`;

  async function signOut() {
    // Stamps pressed with no signal stay on this phone under this account; they are sent after the next sign-in.
    const waiting = getOutbox().pending;
    if (
      waiting > 0 &&
      !(await confirmDialog({
        title: t`ログアウトしますか？`,
        body: t`送信待ちのスタンプが${waiting}件あります。ログアウトすると、次にログインするまで送れません。ログアウトしますか？`,
        yes: t`ログアウトする`,
      }))
    )
      return;
    setLeaving(true);
    await clearSavedPages(); // the saved pages show this person's stamps
    await logOut();
    setLeaving(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <header
      className={`print:hidden site-header ${onLanding ? "sticky top-0 z-30 h-0" : "relative z-30 wide:sticky wide:top-0 wide:h-0"}`}
    >
      {backdropMounted ? (
        // Tapping outside the panel closes it. (Escape and the button do the same for the keyboard.) On a tablet the dimmed
        // space beside the menu shows the logo; on a desktop the page stays as it is.
        <div
          ref={backdropRef}
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-10 bg-black/50 wide:bg-transparent"
        >
          <span className="pointer-events-none absolute inset-y-0 left-[26rem] right-0 hidden items-center justify-center md:flex wide:hidden">
            <KatsuragiLogo className="h-auto w-3/4 [--color-brand:#fff] [--color-ink:#fff] [filter:drop-shadow(0_1px_4px_rgb(0_0_0/0.6))]" />
          </span>
        </div>
      ) : null}
      <div
        inert={hidden}
        // The bar is as wide as the tab bar at the bottom (same side gaps), with the logo in the middle.
        className={
          onMap
            ? "pointer-events-none absolute inset-x-3 top-[calc(0.75rem+var(--top-clear))] wide:hidden"
            : onLanding
              ? `absolute inset-x-0 top-0 border-b border-line/30 bg-paper px-3 pb-1 pt-[calc(0.25rem+var(--top-clear))] transition-opacity md:hidden motion-reduce:transition-none ${hidden ? "pointer-events-none opacity-0" : ""}`
              : "site-header-bar relative mb-3 border-b border-line/30 bg-paper px-3 py-1 wide:hidden"
        }
      >
        <div
          className={`mx-auto grid max-w-xl items-center gap-2 md:max-w-none ${onMap ? "pointer-events-none grid-cols-[auto_1fr_auto] [&>*]:pointer-events-auto" : onRoutes ? "grid-cols-[auto_1fr_auto]" : "grid-cols-[1fr_auto_1fr]"}`}
        >
          {onRoutes ? null : TOP_LEVEL.test(pathname) ? (
            <span />
          ) : (
            <button
              type="button"
              onClick={goBack}
              aria-label={t`もどる`}
              className={`${barButton} min-w-12 justify-center justify-self-start`}
            >
              <ChevronLeftIcon />
            </button>
          )}
          {/* The logo is a link home. It is drawn in the page (inline SVG, not an image), so there is nothing to long-press and
              save. On the map the bar has no background, so the logo gets a halo in the page colour to stay readable. */}
          {!open ? (
            <Link
              href="/"
              aria-label={t`ホーム`}
              className={`rounded-lg p-1 ${onMap ? "justify-self-start" : ""}`}
            >
              <KatsuragiLogo
                compact
                className={`h-9 w-auto ${onMap ? "[filter:drop-shadow(0_0_1px_var(--color-paper))_drop-shadow(0_0_3px_var(--color-paper))_drop-shadow(0_0_6px_var(--color-paper))]" : ""}`}
              />
            </Link>
          ) : (
            <span />
          )}
          {/* The course list: the page's title stands beside the logo, up in the bar (the page itself has no heading on a phone). */}
          {onRoutes ? (
            open ? (
              <span />
            ) : (
              <p className="line-clamp-2 min-w-0 font-serif text-xl font-bold leading-tight text-accent tall:text-2xl">
                {barTitle}
              </p>
            )
          ) : null}
          {/* Open: the language drop-down takes the right end of the bar, so the bar and the menu read as one piece. */}
          {/* On a tablet this corner is the menu button's (TabBar), so it stays empty. */}
          <span className="justify-self-end md:invisible">
            {open ? <LocaleSelect /> : sample ? <SampleNoticeButton /> : null}
          </span>
        </div>
        {/* The rally page's バッジ and ? on a tablet: in the bar, just left of the メニュー button and at its height (user, 2026-11-19).
            Drawn by the bar itself, so they never depend on where the page's content is laid out. */}
        {/^\/rallies\/?$/.test(pathname) ? (
          <div className="absolute right-[11rem] top-1 hidden items-center gap-2 md:flex wide:hidden">
            <Link
              href="/badges"
              className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-lg font-bold text-accent"
            >
              {t`バッジ`}
            </Link>
            <Link
              href="/guide"
              aria-label={t`遊び方`}
              className="inline-flex size-11 items-center justify-center rounded-full bg-surface text-xl font-bold text-accent"
            >
              ?
            </Link>
          </div>
        ) : null}
      </div>

      {panelMounted ? (
        <div
          ref={panelRef}
          id="site-menu"
          // A link to the page we are already on does not change the path, so close here to show the tap worked.
          onClick={(e) =>
            e.target instanceof Element &&
            e.target.closest("a") &&
            setOpen(false)
          }
          // On a phone: from below the status bar (a top border that size) down to the tab bar's top, or the bottom while it is away.
          className="fixed inset-x-0 top-0 bottom-[calc(var(--tabbar-room)+var(--bar-inset))] z-20 overflow-hidden border-t-[length:var(--top-clear)] border-t-rail bg-rail md:inset-auto md:inset-y-0 md:right-auto md:w-[26rem] md:border-t-0 md:border-r md:border-line/30 md:shadow-[8px_0_24px_rgb(0_0_0/0.18)]"
        >
          {/* The drawer has the sidebar's frame, which stays put while the menu scrolls inside it (phones too since 2026-11-26). */}
          {panelGround()}
          {/* The menu scrolls inside the frame only, fading out just inside its lines. */}
          <div className="absolute inset-[14px] overflow-y-auto overscroll-contain [scrollbar-width:none] [mask-image:linear-gradient(transparent,#000_1.5rem,#000_calc(100%-1.5rem),transparent)] wide:[scrollbar-width:thin]">
            <div className="mx-auto flex max-w-xl flex-col gap-8 px-4 py-5 md:px-[15px] md:py-[1.75rem]">
              {/* On a desktop the drawer has its own close button at the top; on a tablet the menu button turns into it. */}
              <div className="flex items-center justify-between gap-2 md:hidden wide:flex wide:justify-end">
                <h1 className="font-serif text-3xl font-bold text-accent md:hidden">{t`メニュー`}</h1>
                {/* On a phone the Menu tab below closes it; the popover has no tab to press. */}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="tap-target hidden items-center gap-2 rounded-xl border border-ink px-3 text-lg font-bold wide:inline-flex"
                >
                  <CloseIcon />
                  {t`閉じる`}
                </button>
              </div>

              {/* A tablet has no tab bar and no sidebar: the tabs lead the menu. So does a phone's, opened from the round
                  button while the tab bar is away (globals.css, data-menu-tabs). */}
              <nav
                aria-label={t`メインメニュー`}
                data-menu-tabs
                className="hidden md:block wide:hidden"
              >
                <ul className="flex flex-col gap-2">
                  {[
                    { path: "/", label: t`ホーム`, icon: <HomeIcon /> },
                    { path: "/map", label: t`マップ`, icon: <MapIcon /> },
                    { path: "/routes", label: t`コース`, icon: <RouteIcon /> },
                    {
                      path: "/rallies",
                      label: t`スタンプ`,
                      icon: <StampIcon />,
                    },
                  ].map(({ path, label, icon }) => {
                    const active =
                      path === "/"
                        ? pathname === "/"
                        : pathname.startsWith(path);
                    return (
                      <li key={path}>
                        <Link
                          href={path}
                          aria-current={active ? "page" : undefined}
                          className={`flex min-h-14 items-center gap-4 rounded-xl px-5 text-xl font-bold [&_svg]:size-6 ${active ? "bg-selected text-on-selected" : "text-ink hover:bg-paper"}`}
                        >
                          {icon}
                          {label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              <MenuGroup title={t`アカウント`}>
                {signedIn ? (
                  <>
                    {/* Who is signed in, for a glance; changing it is on the profile page (the account settings item below). */}
                    <div className="-mx-4">
                      <ProfileCard {...profile} locale={locale} readOnly />
                    </div>
                    <MenuLinks>
                      <MenuLink
                        href="/profile"
                        icon={<GearIcon />}
                        label={t`アカウント設定`}
                      />
                      {staff ? (
                        <MenuLink
                          href="/admin"
                          icon={<GearIcon />}
                          label={t`管理画面`}
                        />
                      ) : null}
                    </MenuLinks>
                    <button
                      type="button"
                      onClick={signOut}
                      disabled={leaving}
                      className={buttonStyle("secondary", "lg", "flex w-full")}
                    >
                      {t`ログアウト`}
                    </button>
                  </>
                ) : (
                  <div className="pattern-shippo flex flex-col gap-3 rounded-lg bg-surface p-4">
                    <Link
                      prefetch={false}
                      href={loginHref}
                      className={buttonStyle("action", "lg", "flex w-full")}
                    >
                      {t`ログイン`}
                    </Link>
                    <Link
                      prefetch={false}
                      href={registerHref}
                      className={buttonStyle("secondary", "lg", "flex w-full")}
                    >
                      {t`新規登録`}
                    </Link>
                  </div>
                )}
              </MenuGroup>

              <MenuGroup title={t`その他`}>
                <MenuLinks>
                  <MenuLink
                    href="/bookmarks"
                    icon={<BookmarkIcon />}
                    label={t`ブックマーク`}
                  />
                  <MenuLink
                    href="/blog"
                    icon={<DocumentIcon />}
                    label={t`ブログ`}
                  />
                  <MenuLink
                    href="/places"
                    icon={<ShopIcon />}
                    label={t`お店・施設`}
                  />
                </MenuLinks>
              </MenuGroup>

              <MenuGroup title={t`表示・設定`}>
                <div className="flex flex-col gap-2">
                  {/* One light list, the same rows as the settings page: the words on the left, the switch or the choice on the right. */}
                  <div className="divide-y divide-line/40 overflow-hidden rounded-lg bg-surface">
                    <div className="tap-target flex items-center gap-4 px-4 py-3">
                      <span className="min-w-0 flex-1 text-lg font-bold">{t`テーマ`}</span>
                      <ThemeSwitcher plain />
                    </div>
                    {/* Both languages written out, each in its own script, so a visitor who landed on the Japanese site can spot
                      "English" without opening anything (user's friend, 2026-11-19). */}
                    <div className="menu-locale tap-target flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                      <span className="min-w-0 flex-1 text-lg font-bold">
                        {t`言語`}
                        {locale === "ja" ? (
                          <span
                            lang="en"
                            className="ml-2 font-normal text-muted"
                          >
                            Language
                          </span>
                        ) : null}
                      </span>
                      <LocaleSwitcher />
                    </div>
                  </div>
                  <MenuLinks>
                    <MenuLink href="/settings" label={t`見やすさの設定`} />
                  </MenuLinks>
                  <p className="text-base text-muted">{t`文字の大きさ、ふりがな、くっきり表示、画面の動き、音、地図の表示`}</p>
                </div>
              </MenuGroup>

              {/* From 768 px these links are in the page footer (a tablet has the room; user, 2026-11-19), so the menu leaves them out. */}
              <div className="flex flex-col gap-4 md:hidden">
                <MenuGroup title={t`このアプリについて`}>
                  <MenuLinks>
                    <MenuLink href="/faq" label={t`よくあるご質問`} />
                    <MenuLink href="/status" label={t`システム状況`} />
                    <MenuLink href="/terms" label={t`利用規約`} />
                    <MenuLink href="/privacy" label={t`プライバシーポリシー`} />
                    <MenuLink href="/licenses" label={t`ライセンス情報`} />
                    <MenuLink href="/sitemap" label={t`サイトマップ`} />
                  </MenuLinks>
                </MenuGroup>
                <p
                  lang={locale === "ja" ? "ja" : "en"}
                  className="text-base text-muted"
                >
                  {locale === "ja" ? foundationJa : foundationEn}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

/** One group of the menu: a heading with the red bar (as on the rally page) over its content. */
function MenuGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="border-l-4 border-brand pl-3 font-serif text-xl font-bold text-accent">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Links onward in one panel (small corners), a line between rows; links are ink, not buttons. */
function MenuLinks({ children }: { children: ReactNode }) {
  return (
    <ul className="flex flex-col divide-y divide-line/60 overflow-hidden rounded-lg bg-surface">
      {children}
    </ul>
  );
}

function MenuLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon?: ReactNode;
}) {
  return (
    <li>
      <Link
        prefetch={false}
        href={href}
        className="tap-target flex items-center gap-3 px-4 py-1 text-lg font-bold hover:bg-paper"
      >
        {icon}
        <span className="min-w-0 flex-1">{label}</span>
        <ChevronIcon />
      </Link>
    </li>
  );
}
