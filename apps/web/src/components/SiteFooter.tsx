import Link from "next/link";
import { Trans, useLingui } from "@lingui/react/macro";
import { foundationEn, foundationJa } from "@/lib/terms-content";

/**
 * What every page ends with: help, status and the legal pages, and who makes the app. The blog and the directory are
 * content, reached from the メニュー, so they are not repeated here (2026-11-19: the desktop sidebar had grown too long,
 * so these links moved from it to the foot of the page). The `site-footer` class lets the map page hide it.
 */
export function SiteFooter({ locale }: { locale: string }) {
  const { t } = useLingui();
  const link = "tap-target inline-flex items-center text-lg font-bold underline";
  return (
    <footer className="print:hidden site-footer mx-4 mt-16 border-t border-line/30 pt-4 wide:mx-0">
      <nav aria-label={t`フッター`} className="flex flex-wrap gap-x-6 gap-y-1">
        <Link prefetch={false} href="/faq" className={link}>
          <Trans>よくあるご質問</Trans>
        </Link>
        <Link prefetch={false} href="/status" className={link}>
          <Trans>サイトの状態</Trans>
        </Link>
        <Link prefetch={false} href="/sitemap" className={link}>
          <Trans>サイトマップ</Trans>
        </Link>
        <Link prefetch={false} href="/terms" className={link}>
          <Trans>利用規約</Trans>
        </Link>
        <Link prefetch={false} href="/privacy" className={link}>
          <Trans>プライバシーポリシー</Trans>
        </Link>
        <Link prefetch={false} href="/licenses" className={link}>
          <Trans>ライセンス情報</Trans>
        </Link>
      </nav>
      {/* A credit line, kept small: Japanese name on the Japanese pages, English name on the English ones. */}
      <p lang={locale === "ja" ? "ja" : "en"} className="mt-3 text-base text-muted">
        {locale === "ja" ? foundationJa : foundationEn}
      </p>
    </footer>
  );
}
