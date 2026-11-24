import { useLingui } from "@lingui/react/macro";
import type { ErrorKey } from "@/lib/api-error";

/**
 * The sentence for every error name, in the visitor's language (WBS 3.3.4). One table for the whole app, so the
 * same problem is always worded the same way. `Record<ErrorKey, string>` makes the compiler refuse a name that
 * has no sentence, and `lib/api-error.ts` refuses an API code that is not listed there.
 */
export function useErrorMessages(): Record<ErrorKey, string> {
  const { t } = useLingui();
  return {
    // Any request
    bad_request: t`リクエストを処理できませんでした。もう一度お試しください。`,
    validation_failed: t`入力内容に誤りがあります。確認の上、もう一度お試しください。`,
    not_found: t`お探しのデータが見つかりませんでした。`,
    rate_limited: t`操作が集中しています。しばらく時間をおいてから再度お試しください。`,
    internal_error: t`一時的なエラーが発生しました。しばらく時間をおいてから再度お試しください。`,
    // Login and permissions
    staff_check_required: t`セッションの有効期限が切れました。ページを再読み込みして本人確認を行ってください。`,
    invalid_login: t`メールアドレスまたはパスワードが正しくありません。パスワード未設定の場合は、メール認証でログインしてください`,
    password_too_short: t`パスワードは8文字以上で入力してください。`,
    password_too_common: t`推測されやすいパスワードは使用できません。別のパスワードを設定してください。`,
    invalid_undo_link: t`このリンクは無効です（期限切れ、または使用済み）。認証コードでログインし、ログイン方法を確認してください。`,
    unauthenticated: t`ログインの有効期限が切れました。再度ログインしてください。`,
    forbidden: t`この操作を行う権限がありません。`,
    reauth_required: t`操作を続けるには、もう一度本人確認が必要です。`,
    invalid_code: t`認証コードが正しくないか、有効期限が切れています。`,
    no_email: t`メールアドレスが登録されていません。顔・指紋認証で確認してください。`,
    no_passkey: t`顔・指紋認証が設定されていません。メールの認証コードで確認してください。`,
    reauth_failed: t`本人確認に失敗しました。もう一度お試しください。`,
    // Passkeys
    login_failed: t`ログインできませんでした。この端末に顔・指紋認証を設定していない場合は、メールでログインしてください。`,
    registration_failed: t`登録に失敗しました。もう一度お試しください。`,
    too_many_passkeys: t`顔・指紋認証の登録上限に達しています。不要な方法を削除してから再度お試しください。`,
    last_login_method: t`他にログイン方法がないため削除できません。先にメールアドレス、または別の端末の顔・指紋認証を登録してください。`,
    email_in_use: t`このメールアドレスは使用できません。すでに別のアカウントで登録されているか、このアカウントに設定済みです。`,
    // Google, LINE and Apple
    sso_unavailable: t`このログイン方法は現在利用できません。`,
    sso_failed: t`ログインを確認できませんでした。時間切れか、別のブラウザで開かれた可能性があります。もう一度お試しください。`,
    sso_cancelled: t`ログインがキャンセルされました。`,
    sso_staff: t`編集者・管理者は、メールまたは顔・指紋認証でログインしてください。`,
    sso_email_in_use: t`このメールアドレスのアカウントはすでに存在します。メールでログイン後、「ログイン方法」から連携してください。`,
    sso_taken: t`このアカウントはすでに別のアカウントと連携されています。`,
    sso_not_yours: t`連携されていないアカウントで認証されました。連携済みのアカウントでお試しください。`,
    // Profile
    invalid_display_name: t`表示名に使用できない文字が含まれているか、40文字を超えています。`,
    // Admin: routes and places
    conflict: t`ほかのユーザーは先に保存しました。ページを再読み込みしてからやり直してください。`,
    invalid_video_url: t`動画URLは https:// で始まるYouTube、またはアップロード済み動画（.mp4・.webm）のみ指定できます。`,
    invalid_line: t`コースの線が不正です。日本国内に2点以上で描画してください`,
    invalid_photo_url: t`画像URLは https:// で始まるもののみ指定できます。`,
    route_has_places: t`経由地が残っているコースは削除できません。先に経由地を削除してください。`,
    // Stamping
    spot_closed: t`この場所は現在通行止めなどで閉鎖中のため、スタンプを押せません。`,
    too_far: t`対象の場所から離れています。近づいてからもう一度お試しください。`,
    stamp_revoked: t`このスタンプは確認のため取り消されています。ご不明な点は運営までお問合せください。`,
    stale_scan: t`スタンプを押してから48時間以上経過しているため、受け付けられませんでした。`,
    bad_time: t`スタンプの取得時刻が正しくありません。端末の日時設定を確認してください。`,
    gps_accuracy_poor: t`GPSの精度が低い状態です。空の明けた場所に移動してからもう一度お試しください。`,
    guest_full: t`ゲスト状態で保存できるスタンプの上限に達しました。新規登録すると続き集められます。`,
    spot_has_stamps: t`有効なスタンプが残っている経由地は削除できません。先に「スタンプ」一覧で取り消すか、「非公開にする」を使用してください。`,
    no_coordinates: t`経由地の位置が設定されていません。地図上で位置を設定してください。`,
    position_not_verified: t`位置情報が公式情報で確認されていません。確認後、「位置を確認した」にチェックを入れてください`,
    source_required: t`位置を確認した情報源（サイトの名やURL）を入力してください。`,
    permission_required: t`現地の許可が確認されていません。許可を得たうえで「許可確認済み」にチェックを入れてください。`,
    note_required: t`「案内のみ」の場所は、「状態のひとこと」（日本語）を入力してから公開してください。`,
    // Admin: rallies
    rally_empty: t`中身が空のラリーは公開できません。公開中のスタンプラリーを空にすることもできません。`,
    invalid_rally_members: t`経由地ラリーにはスタンプ対象の経由地を、コースラリーにはコースを設定してください（重複不可）`,
    // Admin: lists (trail notices, ...)
    cannot_change_own_role: t`自分の権限は変更できません。他の管理者に依頼してください。`,
    cannot_manage_self: t`自分のアカウントは制限または削除することはできません。`,
    cannot_manage_admin: t`管理者アカウントは制限・削除できません。先に権限を変更してください。`,
    deletion_by_admin: t`この削除は管理者によって予約されています。プロフィール画面から異議を申し立てることができます。`,
    no_admin_deletion: t`管理者によって予約瀬れた削除はありません。`,
    account_restricted: t`このアカウントは現在制限されています。スタンプの取得やコメントの投稿はできません。`,
    invalid_source_url: t`出典URLは https:// で始まる形式で入力してください。`,
    // Admin: photo uploads
    invalid_file: t`アップロードできるのは4MB以下のJPEG・PNG・WebP画像、または200MB以下のMP4・WebMのみです。`,
    uploads_unavailable: t`画像を保存できませんでした。しばらく時間をおいてから再度お試しください。`,
    // Admin: snapping a line to trails
    routing_unavailable: t`ルートに沿わせる機能は現在利用できません。管理者にルート案内サービスの設定を依頼してください（手動での描画は可能です）。`,
    routing_no_route: t`周辺に歩ける道が見つかりませんでした。ポイントを道の近くに配置してお試しください。`,
    routing_failed: t`ルートを取得できませんでした。しばらく時間をおいてから再度お試しください。`,
    // From the phone itself
    unsupported: t`この端末では顔・指紋認証を利用できません。メールでログインしてください。`,
    cancelled: t`顔・指紋認証がキャンセルされました。もう一度お試しください。`,
    network: t`通信エラーが発生しました。もう一度お試しください。`,
    failed: t`エラーが発生しました。しばらく時間をおいてから再度お試しください。`,
  };
}
