import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useLingui } from "@lingui/react/macro";
import { confirmDialog } from "@/components/ConfirmDialog";

/** Leaving with unsaved work: closing the tab, following a link inside the admin, or the Back button all ask first. */
export function useUnsavedGuard(dirty: boolean) {
  const { t } = useLingui();
  const router = useRouter();
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    const leave = () => confirmDialog({ title: t`ページを離れますか？`, body: t`保存していない変更は消えます。`, yes: t`離れる`, no: t`編集をつづける` });
    const follow = (e: MouseEvent) => {
      // Ctrl/Cmd/Shift-click and the middle button open another tab or window: this page stays, nothing to ask.
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.origin !== window.location.origin || a.pathname === window.location.pathname) return;
      // The answer comes later, so the click is always stopped here and followed by hand on a yes.
      e.preventDefault();
      e.stopPropagation();
      void leave().then((yes) => {
        if (yes) router.push(a.pathname + a.search + a.hash);
      });
    };
    // The Back button: next's router has no way to block it, so one extra history entry is added while there is unsaved
    // work. Back then only removes that entry (and fires popstate), and the person is asked before going on or staying.
    // shortcut: after saving, that one extra entry stays, so Back is pressed once more on the same page.
    // The entry is marked, so editing, saving and editing again does not stack one entry per round.
    const guardEntry = () => history.pushState({ ...history.state, ktrgGuard: true }, "", window.location.href);
    if (!(history.state as { ktrgGuard?: boolean } | null)?.ktrgGuard) guardEntry();
    const back = async () => {
      if (await leave()) {
        window.removeEventListener("popstate", back);
        history.back();
      } else guardEntry();
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("popstate", back);
    document.addEventListener("click", follow, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("popstate", back);
      document.removeEventListener("click", follow, true);
    };
  }, [dirty, t, router]);
}
