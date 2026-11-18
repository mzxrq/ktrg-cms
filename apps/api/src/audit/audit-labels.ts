import type { Label } from "../admin-lists/list-types";
import { AUDIT_ACTIONS, type AuditAction } from "./audit-log";

// What each audit action reads as in the change log ("コースを変更", "Course changed"), so an admin reads a sentence, not
// "route.update". Most are a kind of item and a verb; the sign-in and account actions are written out whole.

const ITEM: Record<string, Label> = {
  route: { ja: "コース", en: "Course" },
  spot: { ja: "経由地", en: "Waypoint" },
  rally: { ja: "ラリー", en: "Rally" },
  notice: { ja: "お知らせ", en: "Notice" },
  post: { ja: "記事・ページ", en: "Post or page" },
  banner: { ja: "バナー", en: "Banner" },
  furigana: { ja: "ふりがな", en: "Furigana" },
  place: { ja: "場所", en: "Place" },
  author: { ja: "書き手", en: "Writer" },
  tag: { ja: "タグ", en: "Tag" },
  comment: { ja: "コメント", en: "Comment" },
  site_page: { ja: "ページ", en: "Page" },
  site_setting: { ja: "サイトの設定", en: "Site setting" },
  stamp: { ja: "スタンプ", en: "Stamp" },
  passkey: { ja: "顔・指紋のログイン", en: "Passkey" },
  upload: { ja: "写真", en: "Photo" },
  user: { ja: "アカウント", en: "Account" },
};

const VERB: Record<string, Label> = {
  create: { ja: "を作成", en: "created" },
  update: { ja: "を変更", en: "changed" },
  delete: { ja: "を削除", en: "deleted" },
  reorder: { ja: "を並べ替え", en: "reordered" },
  publish: { ja: "を公開", en: "published" },
  unpublish: { ja: "の公開をやめた", en: "unpublished" },
  share: { ja: "をほかのコースにも追加", en: "added to another course" },
  unshare: { ja: "をほかのコースから外した", en: "taken off another course" },
  add: { ja: "を追加", en: "added" },
  remove: { ja: "を削除", en: "removed" },
  rename: { ja: "の名前を変更", en: "renamed" },
  approve: { ja: "を承認", en: "approved" },
  refresh: { ja: "を辞書で読み直した", en: "re-read by the dictionary" },
  revoke: { ja: "を取り消した", en: "revoked" },
  restore: { ja: "を元に戻した", en: "restored" },
};

const WHOLE: Partial<Record<AuditAction, Label>> = {
  "user.role.bootstrap_admin": { ja: "最初の管理者になった", en: "Became the first admin" },
  "session.login": { ja: "ログイン", en: "Signed in" },
  "session.logout": { ja: "ログアウト", en: "Signed out" },
  "session.reauth": { ja: "本人確認をやり直した", en: "Confirmed identity again" },
  "session.keep_staff_check": { ja: "この端末を覚えた", en: "Kept this device" },
  "email.add": { ja: "メールアドレスを追加", en: "Email added" },
  "password.set": { ja: "パスワードを設定", en: "Password set" },
  "password.remove": { ja: "パスワードを削除", en: "Password removed" },
  "password.undo": { ja: "パスワードの変更を取り消した", en: "Password change undone" },
  "user.deletion_request": { ja: "アカウントの削除を申し込んだ", en: "Asked to delete the account" },
  "user.deletion_cancel": { ja: "アカウントの削除をやめた", en: "Cancelled the account deletion" },
  "user.deleted": { ja: "アカウントが削除された", en: "Account deleted" },
  "spot.status.change": { ja: "経由地の状態を変更", en: "Waypoint status changed" },
  "spot.reorder": { ja: "経由地を並べ替え", en: "Waypoints reordered" },
  "rally.members.update": { ja: "ラリーの中身を変更", en: "Rally contents changed" },
  "rally.kind.change": { ja: "ラリーの種類を変更", en: "Rally kind changed" },
  "user.role.change": { ja: "権限を変更", en: "Permission changed" },
  "user.restrict": { ja: "アカウントを制限", en: "Account restricted" },
  "user.restriction_lift": { ja: "アカウントの制限を解除", en: "Account restriction lifted" },
  "user.deletion_request_by_admin": { ja: "アカウントの削除を決めた（管理者）", en: "Account deletion set (by an admin)" },
  "user.deletion_cancel_by_admin": { ja: "アカウントの削除をやめた（管理者）", en: "Account deletion cancelled (by an admin)" },
  "user.deletion_appeal": { ja: "削除に異議を出した", en: "Appealed the deletion" },
  "user.deleted_by_admin": { ja: "アカウントをすぐに削除（管理者）", en: "Account deleted at once (by an admin)" },
  "upload.create": { ja: "写真をアップロード", en: "Photo uploaded" },
};

/** The words for one action; an action without words of its own (a new one) falls back to its code. */
export function auditActionLabel(action: AuditAction): Label {
  const whole = WHOLE[action];
  if (whole) return whole;
  const verb = VERB[action.split(".").at(-1)!];
  const item = ITEM[AUDIT_ACTIONS[action]];
  if (!verb || !item) return { ja: action, en: action };
  return { ja: `${item.ja}${verb.ja}`, en: `${item.en} ${verb.en}` };
}

/** Every action as a choice of the change log's "what" field. */
export const AUDIT_ACTION_OPTIONS = (Object.keys(AUDIT_ACTIONS) as AuditAction[]).map((value) => ({ value, label: auditActionLabel(value) }));
