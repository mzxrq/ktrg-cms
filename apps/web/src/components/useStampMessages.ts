"use client";

import { useLingui } from "@lingui/react/macro";
import type { Problem } from "@/lib/stamp-flow";

/** What to tell the visitor for every way a stamp can fail, in their language (the stamp button and the rally page share it). */
export function useStampMessages(): Record<Problem, string> {
  const { t } = useLingui();
  return {
    unsupported: t`この端末・ブラウザでは位置情報を利用できません。`,
    denied: t`位置情報の利用が許可されていません。ブラウザの設定でこのサイトの位置情報を許可してから、もう一度お試しください。`,
    unavailable: t`現在地を取得できませんでした。空の開けた場所で、もう一度お試しください。`,
    timeout: t`現在地の取得に時間がかかっています。空の開けた場所で、もう一度お試しください。`,
    too_far: t`対象の場所から離れています。近づいてからもう一度お試しください。`,
    low_accuracy: t`GPSの精度が低い状態です。空の開けた場所に移動してからもう一度お試しください。`,
    spot_closed: t`この場所は現在閉鎖中のため、スタンプを押せません。`,
    stale_scan: t`スタンプを押してから48時間以上経過しているため、受け付けられませんでした。`,
    bad_time: t`スタンプの取得時刻が正しくありません。端末の日時設定を確認してください。`,
    rally_not_active: t`このスタンプラリーは現在開催されていません。`,
    not_ready: t`スタンプ機能は現在利用できません。`,
    login_needed: t`ログインの有効期限が切れました。再度ログインをお試しください。`,
    guest_full: t`ゲスト状態で保存できるスタンプの上限に達しました。新規登録すると引き続き集められます。`,
    stamp_revoked: t`このスタンプは確認のため取り消されています。ご不明な点は運営までお問い合わせください。`,
    account_restricted: t`このアカウントは現在制限されています。スタンプの取得やコメントの投稿はできません。`,
    too_many_requests: t`操作が集中しています。しばらく時間をおいてから再度お試しください。`,
    network: t`通信エラーが発生しました。もう一度お試しください。`,
    failed: t`エラーが発生しました。しばらく時間をおいてからもう一度お試しください。`,
  };
}
