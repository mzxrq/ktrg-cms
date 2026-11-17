"use client";

import { useCallback, useRef } from "react";
import { useLingui } from "@lingui/react/macro";
import { confirmDialog } from "@/components/ConfirmDialog";

/**
 * For a form opened in place (a banner edited or added on the home screen): the page's unsaved guard only asks when the page
 * is left, so folding the form away would drop its changes silently. Hand `onDirtyChange` to the form, and await
 * `okToClose()` before closing it or opening another: it asks only when there are unsaved changes.
 */
export function useDiscardCheck() {
  const { t } = useLingui();
  const dirty = useRef(false);
  const onDirtyChange = useCallback((now: boolean) => {
    dirty.current = now;
  }, []);
  const okToClose = useCallback(async () => {
    if (!dirty.current) return true;
    const yes = await confirmDialog({ title: t`変更を捨てますか？`, body: t`保存していない変更は消えます。`, yes: t`捨てる`, no: t`編集をつづける` });
    if (yes) dirty.current = false;
    return yes;
  }, [t]);
  return { onDirtyChange, okToClose };
}
