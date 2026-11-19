import { VisitBeacon } from "@/components/VisitBeacon";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { MenuProvider } from "@/components/MenuProvider";
import { StampOutbox } from "@/components/StampOutbox";
import { NavigationProvider } from "@/components/navigation/NavigationProvider";
import { speaksByDefault } from "@/lib/navigation/voice";
import { NavigationToast } from "@/components/navigation/NavigationHud";
import { OfflineNotice } from "@/components/OfflineNotice";
import { SampleNoticeHost } from "@/components/SampleNotice";
import { SiteFooter } from "@/components/SiteFooter";
import { LocaleSelect } from "@/components/LocaleSwitcher";
import { StampFilters } from "@/components/StampFilters";
import { BookmarkProvider } from "@/components/useBookmarks";
import { InstallNudge } from "@/components/InstallNudge";
import { BrowserWarning } from "@/components/BrowserWarning";
import { GuestClaim } from "@/components/GuestClaim";
import { GuestNag } from "@/components/GuestNag";
import { StampProgressPopup } from "@/components/StampProgressPopup";
import { FuriganaLayer } from "@/components/FuriganaLayer";
import { ScrollTopButton } from "@/components/ScrollTopButton";
import { SiteHeader } from "@/components/SiteHeader";
import { TabBar } from "@/components/TabBar";
import { PrefsSync } from "@/components/settings/PrefsSync";
import { SessionRotate } from "@/components/settings/SessionRotate";
import { getPrefsState } from "@/lib/server-prefs";
import { getViewer } from "@/lib/viewer";
import { sampleContentEnabled } from "@/lib/content";
import { initLingui } from "@/i18n/server";

// Participant side: mobile first. A slim bar on top (menu), the page, and a tab bar at the bottom.
//   Tablet (768 px and up): a side rail on the left and one centred column.
//   Desktop (1024 px and up): a sidebar fixed to the far left of the screen (logo, tabs, and the site's footer links
//   at its bottom, always in view) and a wide content area; each page lays itself out in several columns there.
// The bottom padding keeps content clear of the phone's tab bar.
export default async function PublicLayout({ children }: { children: ReactNode }) {
  const i18n = await initLingui();
  const sample = sampleContentEnabled();
  const [viewer, prefsState, jar] = await Promise.all([getViewer(), getPrefsState(), cookies()]);
  // Stamps held without an account live in a signed cookie (guest/ in the API); the server only needs to know it is there.
  const hasGuestStamps = jar.has("guest") || jar.has("__Host-guest");

  return (
    <MenuProvider>
      <BookmarkProvider signedIn={viewer.signedIn} ids={viewer.bookmarks}>
      <NavigationProvider signedIn={viewer.signedIn} voiceByDefault={speaksByDefault(viewer.ageRange)}>
      <VisitBeacon />
      <StampFilters />
      <div className="mx-auto flex w-full max-w-5xl justify-center wide:mx-0 wide:max-w-none wide:justify-start wide:gap-0">
        {/* Under the desktop sidebar's tabs only the language (easy to find on a computer, 2026-11-16); the other links are
            in the page footer and the メニュー. */}
        <TabBar
          footer={
            <div className="[&_select]:w-full [&_select]:justify-between [&_select]:px-5 [&_select]:rounded-xl">
              <LocaleSelect plain />
            </div>
          }
        />
        {/* A phone column; from a tablet up it takes the full width (2026-11-19: a tablet reads like a phone page, not a strip in the middle). */}
        <div className="min-w-0 max-w-xl flex-1 md:flex md:min-h-dvh md:max-w-none md:flex-col">
          <SiteHeader
            signedIn={viewer.signedIn}
            staff={viewer.role === "editor" || viewer.role === "admin"}
            locale={i18n.locale}
            profile={{ publicId: viewer.publicId, deletionDueAt: viewer.deletionDueAt, name: viewer.name, origin: viewer.origin, originPlace: viewer.originPlace, ageRange: viewer.ageRange, gender: viewer.gender, foundVia: viewer.foundVia }}
            prefs={prefsState.effective}
            sample={sample}
          />
          <OfflineNotice />
          {sample ? <SampleNoticeHost /> : null}
          <PrefsSync signedIn={viewer.signedIn} account={prefsState.account} device={prefsState.device} />
          {viewer.signedIn ? <SessionRotate /> : null}
          <main id="main" className="pb-[calc(7rem+var(--nav-toast,0px))] md:pb-[calc(2.5rem+var(--nav-toast,0px))] md:flex md:flex-1 md:flex-col wide:pb-[calc(2rem+var(--nav-toast,0px))] wide:pt-8 wide:has-[[data-landing-top]]:pt-0">
            {/* On a desktop the page fills at least the screen, so the footer sits at the bottom of a short or empty page. */}
            <div className="md:flex md:flex-1 md:flex-col wide:mx-auto wide:w-full wide:max-w-6xl wide:px-10">
              <div className="md:flex-1">
              {viewer.signedIn ? null : <BrowserWarning />}
              {children}
              </div>
              <SiteFooter locale={i18n.locale} />
            </div>
          </main>
        </div>
      </div>
      <InstallNudge />
      {viewer.signedIn ? (hasGuestStamps ? <GuestClaim /> : null) : <GuestNag hasStamps={hasGuestStamps} />}
      {/* Off still draws the words marked いつも表示する (very hard ones); the key restarts it when the setting changes. */}
      <FuriganaLayer key={String(prefsState.effective.furigana)} alwaysOnly={!prefsState.effective.furigana} />
      <ScrollTopButton />
      <StampProgressPopup />
      <StampOutbox userKey={viewer.signedIn ? (viewer.publicId ?? "guest") : "guest"} />
      <NavigationToast />
      </NavigationProvider>
      </BookmarkProvider>
    </MenuProvider>
  );
}
