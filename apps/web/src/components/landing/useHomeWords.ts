import { useLingui } from "@lingui/react/macro";
import type { HomeSlot, HomeText } from "@/lib/home-text";

/** The home page's words: the app's own, with what an editor wrote laid over them. The editor's screen reads the app's own from here too. */
export function useHomeWords(own: HomeText = {}): Record<HomeSlot, string> {
  const { t } = useLingui();
  return {
    heroLine: t`「祈り」を見つめる再発見の旅`,
    rallyHeading: t`スタンプラリー`,
    rallyLead: t`歩いてスタンプを集めよう。`,
    rallyText: t`スタンプ設置場所の近くでボタンを押すと、スタンプが記録されます。現在地はボタンを押したときに一度だけ確認し、保存しません。`,
    routesHeading: t`コース案内`,
    mapHeading: t`全体マップ`,
    storyHeading: t`葛城修験とは`,
    storyText: t`和泉山脈から金剛山地へ。大阪・和歌山・奈良の境にのびるこの山並みは、古くから「葛城」と呼ばれ、神の宿る山として敬われてきました。山で心身を鍛える修験道を開いたと伝わる役行者が、初めて修行をしたのも、この山々だといわれています。`,
    storyCaption: t`役小角（役行者）`,
    videoHeading: t`動画で見る`,
    officialHeading: t`公式サイトで詳しく見る`,
    tourismHeading: t`観光情報`,
    beforeHeading: t`出かける前に`,
    before1: t`山道が含まれます。事前に天候を確認し、飲み物・軽食、歩きやすい靴を用意してください。`,
    before2: t`山間部は電波がつながりにくい場合があります。`,
    before3: t`通行止めなどで道が通れない場合は、無理をせず引き返しください。`,
    beforeNotice: t`出かける前に公式サイトで最新情報を確認してください。`,
    startHeading: t`さあ、始めましょう`,
    ...own,
  };
}
