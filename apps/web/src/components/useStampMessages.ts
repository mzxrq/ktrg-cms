"use client";

import { useLingui } from "@lingui/react/macro";
import type { Problem } from "@/lib/stamp-flow";
import { useErrorMessages } from "./useErrorMessages";

/** What to tell the visitor for every way a stamp can fail, in their language (the stamp button and the rally page share it); a problem the server names reads from useErrorMessages. */
export function useStampMessages(): Record<Problem, string> {
  const { t } = useLingui();
  // The ones the server also answers with are worded once, in the app-wide table.
  const errors = useErrorMessages();
  return {
    unsupported: t`この端末・ブラウザでは位置情報を利用できません。`,
    denied: t`位置情報の利用が許可されていません。ブラウザの設定でこのサイトの位置情報を許可してから、もう一度お試しください。`,
    unavailable: t`現在地を取得できませんでした。空の開けた場所で、もう一度お試しください。`,
    timeout: t`現在地の取得に時間がかかっています。空の開けた場所で、もう一度お試しください。`,
    too_far: errors.too_far,
    low_accuracy: t`GPSの精度が低い状態です。空の明けた場所に移動してからもう一度お試しください。`,
    spot_closed: errors.spot_closed,
    stale_scan: errors.stale_scan,
    bad_time: errors.bad_time,
    rally_not_active: t`このスタンプラリーは現在開催されていません。`,
    not_ready: t`スタンプ機能は現在利用できません。`,
    login_needed: errors.unauthenticated,
    guest_full: errors.guest_full,
    stamp_revoked: errors.stamp_revoked,
    account_restricted: errors.account_restricted,
    too_many_requests: errors.rate_limited,
    network: errors.network,
    failed: errors.failed,
  };
}
