import { Trans } from "@lingui/react/macro";
import { ButtonLink } from "@/components/ButtonLink";
import { initLingui } from "@/i18n/server";

export default async function NotFound() {
  await initLingui();

  return (
    <div className="state-stagger flex flex-col gap-6 px-4">
      <h1 className="font-serif text-3xl font-bold text-accent">
        <Trans>ページが見つかりません</Trans>
      </h1>
      <p className="text-xl">
        <Trans>
          URLが間違っているか、ページが削除・移動された可能性があります。
        </Trans>
      </p>
      <ButtonLink href="/">
        <Trans>ホームに戻る</Trans>
      </ButtonLink>
    </div>
  );
}
