import { Trans } from "@lingui/react/macro";

/** The standing line (CLAUDE.md, trail notices): one message, so every page says it the same way. The home page's copy is editable (useHomeWords). */
export function CheckOfficial() {
  return <Trans>出かける前に公式サイトで最新情報を確認してください。</Trans>;
}
