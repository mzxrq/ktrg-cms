import type { Metadata } from "next";
import { Trans } from "@lingui/react/macro";
import { BackLink } from "@/components/BackLink";
import { initLingui } from "@/i18n/server";
import { Stars } from "@/components/Stars";
import { PHYSICAL_LEVEL_UPPER_BOUNDS, STAR_COUNT, TECHNICAL_LEVELS, technicalStars } from "@/lib/grading";

export async function generateMetadata(): Promise<Metadata> {
  const i18n = await initLingui();
  return { title: i18n.locale === "ja" ? "体力の目安と道のけわしさについて" : "About the effort and trail difficulty stars" };
}

const panel = "mx-4 flex flex-col gap-3 rounded-lg bg-surface p-5 text-lg leading-8";

// How the two levels on a route are worked out. Written in our own words; the idea follows the mountain grading used in Nagano
// Prefecture (信州 山のグレーディング). The numbers are a guide: the person who edits the route chooses the saved level.
export default async function GradingPage() {
  const i18n = await initLingui();
  const ja = i18n.locale === "ja";
  const technical: Record<(typeof TECHNICAL_LEVELS)[number], string> = ja
    ? {
        A: "整備された道で、迷いにくく、転んでも大きな事故になりにくい。",
        B: "急な登り下りや、道がわかりにくい所がある。はしごや鎖がある所もある。",
        C: "転落・滑落の危険がある所がある。地図を読む力と、ミスをしない注意が必要。",
        D: "岩場やガレ場、手を使う急な登り下りがある。道がわかりにくい所も多い。",
        E: "厳しい岩場や藪こぎが続く。道を自分で見つける技術と、高い判断力が必要。",
      }
    : {
        A: "A well-kept path that is hard to lose, where a fall is unlikely to be serious.",
        B: "Steep climbs and descents, and some places that are hard to follow. Some places have ladders or chains.",
        C: "Places where a fall or slip is dangerous. You need to read a map and take care not to make mistakes.",
        D: "Rocky ground and scree, and steep sections where you use your hands. Many places are hard to follow.",
        E: "Long stretches of hard rock or thick brush. You must find your own way and judge well.",
      };

  return (
    <div className="page-narrow flex flex-col gap-6 pt-2">
      <div className="flex flex-col gap-6 px-4">
        <BackLink href="/routes">
          <Trans>コース一覧</Trans>
        </BackLink>
        <h1 className="font-serif text-3xl font-bold text-accent">
          <Trans>体力の目安と道のけわしさについて</Trans>
        </h1>
        <p className="text-lg leading-8">
          <Trans>コースの「体力の目安」と「道のけわしさ」は、歩く前に大変さを知るための目安で、どちらも星1つから5つで表します。星が少ないほどやさしいコースです。公式の情報ではありません。天候や体調によって、大変さの感じ方は変わります。</Trans>
        </p>
      </div>

      <section id="physical" className={`${panel} scroll-mt-24`}>
        <h2 className="border-l-4 border-brand pl-3 font-serif text-xl font-bold text-accent">
          <Trans>体力の目安（星1〜5）</Trans>
        </h2>
        <p>
          <Trans>歩く時間、距離、登りと下りの高さから、「コース定数」という数字を出します。この数字が大きいほど、体力が必要です。</Trans>
        </p>
        <p className="rounded-lg bg-paper p-4 font-bold">
          <Trans>コース定数 ＝ 1.8 × 時間（h） ＋ 0.3 × 距離（km） ＋ 10 × 登り（km） ＋ 0.6 × 下り（km）</Trans>
        </p>
        <p>
          <Trans>たとえば、4時間・距離8km・登り500m・下り500mなら、1.8×4 ＋ 0.3×8 ＋ 10×0.5 ＋ 0.6×0.5 ＝ 14.9 で、星1つです。</Trans>
        </p>
        {/* Two of the prefecture's ten levels to a star: the constant's range for each star. */}
        <ul className="flex flex-col gap-1">
          {Array.from({ length: STAR_COUNT }, (_, i) => {
            const low = i === 0 ? null : PHYSICAL_LEVEL_UPPER_BOUNDS[2 * i - 1];
            const high = i === STAR_COUNT - 1 ? null : PHYSICAL_LEVEL_UPPER_BOUNDS[2 * i + 1];
            return (
              <li key={i} className="flex items-center justify-between gap-4 border-t border-line/30 pt-1 tabular-nums">
                <span className="text-xl">
                  <Stars n={i + 1} />
                </span>
                <span>{low === null ? `〜 ${high}` : high === null ? `${low} 〜` : `${low} 〜 ${high}`}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-base text-muted">
          <Trans>数字は目安です。星の数は、この計算結果をもとに、このサイトの運営者がコースごとに決めています。</Trans>
        </p>
      </section>

      <section id="technical" className={`${panel} scroll-mt-24`}>
        <h2 className="border-l-4 border-brand pl-3 font-serif text-xl font-bold text-accent">
          <Trans>道のけわしさ（星1〜5）</Trans>
        </h2>
        <p>
          <Trans>道のけわしさは計算では出せません。岩場やはしご・くさりの有無、道のわかりやすさなどを見て、このサイトの運営者が決めています。星1つがいちばん歩きやすく、星5つがいちばんけわしい道です。</Trans>
        </p>
        <dl className="flex flex-col gap-2">
          {TECHNICAL_LEVELS.map((level) => (
            <div key={level} className="flex gap-3 border-t border-line/30 pt-2">
              <dt className="shrink-0 text-xl">
                <Stars n={technicalStars(level)} />
              </dt>
              <dd>{technical[level]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="mx-4 text-base text-muted">
        <Trans>この目安は、長野県の「信州 山のグレーディング」をもとにしています。</Trans>
      </p>
    </div>
  );
}
