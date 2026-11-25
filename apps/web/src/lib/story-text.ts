// The story page, in our own words (docs/landing-story-design.md). It replaces the copy of the official page; the facts
// come from the Katsuragi Shugendō Japan Heritage site, which is credited on the page. Plain strings only. `{km}` is
// filled in from lib/rally.ts so the length is written in one place.

export const STORY_SOURCE_URL = "https://katsuragisyugen-nihonisan.com/story/";

type Pair = { ja: string; en: string };
export type StorySection = { heading: Pair; paragraphs: Pair[] };

export const STORY_SECTIONS: StorySection[] = [
  {
    heading: { ja: "修験道は、ここから始まった", en: "Where Shugendō began" },
    paragraphs: [
      {
        ja: "大阪と和歌山の境を東西に延びる和泉山脈と、大阪と奈良の境を南北に走る金剛山地。この峰々の一帯が「葛城」です。全長は約{km}km。古くから神々の宿る山として敬われてきました。",
        en: "The Izumi Mountains stretch east to west along the border of Osaka and Wakayama, while the Kongō Range runs north to south between Osaka and Nara. Together, these ridges form Katsuragi—spanning roughly {km} km—and have long been revered as sacred mountains where deities dwell.",
      },
      {
        ja: "7世紀、現在の奈良県御所市のあたりに生まれた役行者{えんのぎょうじゃ}は、修験道を開いた人物と伝えられています。その役行者が最初に修行を重ねた山が、この葛城でした。",
        en: "In the 7th century, En no Gyōja, traditionally regarded as the founder of Shugendō, was born near what is now Gose in Nara Prefecture. Katsuragi is where he first devoted himself to ascetic training.",
      },
      {
        ja: "後に修行の場を大峯山へ移したとされ、葛城と大峯は、修験者にとってどちらも欠かせない行場となりました。",
        en: "He is later said to have moved his practice to Mount Ōmine, and ever since, both Katsuragi and Ōmine have been considered essential training grounds for Shugendō practitioners.",
      },
      {
        ja: "役行者は、法華経の八巻二十八品を一品ずつ山に埋めたと伝わります。その場所が「経塚」です。1番から28番までの経塚と、滝や巨石、寺社を巡る修行を「葛城修験」と呼びます。",
        en: "Tradition holds that En no Gyōja buried the 28 chapters of the Lotus Sutra one by one across these mountains. Each burial site is known as a sutra mound (kyōzuka), numbered 1 through 28. The ascetic practice of walking these mounds—along with waterfalls, massive rocks, temples, and shrines—is called Katsuragi Shugen.",
      },
    ],
  },
  {
    heading: { ja: "海から始まる道", en: "A trail that begins at the sea" },
    paragraphs: [
      {
        ja: "旅は海から始まります。1番目の経塚「序品窟{じょほんくつ}」は、和歌山市加太の沖に浮かぶ友ヶ島のひとつ、虎島にあります。",
        en: "The journey begins at the sea. The first sutra mound, Johon-kutsu, is a cave on Tora Island, one of the Tomogashima islands off Kada in Wakayama City.",
      },
      {
        ja: "船で渡る沖ノ島から、潮が引いたときだけ岩場を歩いて渡れます。山の修行でありながら、最初の一歩は海辺から始まります。出かける前に、潮の満ち引きと公式サイトの最新情報を確認してください。",
        en: "From Oki Island, where boats arrive, you can cross the rocky shore on foot—but only at low tide. Though it is a mountain ascetic tradition, the very first step begins by the sea. Be sure to check tide times and official updates before visiting.",
      },
    ],
  },
  {
    heading: { ja: "里の人とともに", en: "Alongside the local villages" },
    paragraphs: [
      {
        ja: "葛城の山々はそれほど標高が高くなく、すぐそばに集落があります。そのため修験者は、古くから里の暮らしや信仰と深く結びついてきました。",
        en: "Because the Katsuragi peaks are relatively low and close to local villages, practitioners have long been closely connected to the daily lives and beliefs of the people living at their foot.",
      },
      {
        ja: "特に大阪府の南西部では、田畑を潤す水への祈りが大切にされました。滝や雨乞いの場も行所となり、雨乞いの踊りは、岸和田の葛城踊り、和泉の笹踊りとして今も受け継がれています。",
        en: "In southwestern Osaka in particular, prayers for water to nourish the fields were deeply cherished. Waterfalls and rain-making sites became training grounds, and traditional rain dances still live on today as the Katsuragi Odori in Kishiwada and the Sasa Odori in Izumi.",
      },
      {
        ja: "修験者を支えたのも里の人々でした。和歌山市加太の向井家は代々修験者を迎える役目を務め、紀の川市の中津川には、最も大切な儀式「葛城灌頂{かつらぎかんじょう}」が行われる行所があります。",
        en: "Local communities also supported the practitioners. For generations, the Mukai family of Kada in Wakayama City has hosted visiting ascetics, while Nakatsugawa in Kinokawa City is home to the sacred site where Katsuragi Kanjō—the tradition's most important ritual—is performed.",
      },
      {
        ja: "明治初期、神仏分離に伴う廃仏毀釈や修験宗の廃止により、修験道は一時衰退しました。行所や経塚は荒れ、道さえ分からなくなった場所もあります。それでも、里の人々と修験者によって、この道は今日まで守り伝えられてきました。",
        en: "In the early Meiji era, the forced separation of Shinto and Buddhism, the anti-Buddhist movement, and the abolition of the Shugen sect sent Shugendō into decline. Training sites and sutra mounds fell into disrepair, and some trails were lost altogether. Even so, local residents and practitioners kept the tradition alive and passed it down to the present day.",
      },
    ],
  },
  {
    heading: { ja: "現在の葛城修験、そしてこれから", en: "Katsuragi Shugen, today and tomorrow" },
    paragraphs: [
      {
        ja: "現在も多くの修験者が、この地で修行を続けています。大峯山が女人禁制であるのに対し、葛城修験は多くの女性修験者を受け入れてきました。",
        en: "Many practitioners still train along these trails today. While Mount Ōmine has traditionally been closed to women, Katsuragi Shugen has long welcomed female practitioners.",
      },
      {
        ja: "都市のすぐそばにあるのも、この地の特徴です。関西国際空港は目と鼻の先で、大阪の中心部や京都、高野山も遠くありません。尾根道は近畿自然歩道やダイヤモンドトレールとして整備され、多くのハイカーにも親しまれています。",
        en: "Another defining feature of Katsuragi is its proximity to major cities. Kansai International Airport is just around the corner, with central Osaka, Kyoto, and Mount Kōya all within easy reach. Its ridge routes are maintained as part of the Kinki Nature Trail and the Diamond Trail, making them popular with hikers as well.",
      },
      {
        ja: "歩いていると、滝の音に交じって法螺貝{ほらがい}の響きが聞こえるかもしれません。木立の中にひっそりとたたずむのは、経文が納められた経塚かもしれません。鈴懸{すずかけ}の装束をまとった修験者とすれ違うこともあるでしょう。",
        en: "As you walk, the resonance of a conch shell horn may mingle with the sound of a waterfall. Tucked quietly among the trees, you may come across a sutra mound holding buried scriptures, or even cross paths with a practitioner in traditional suzukake robes.",
      },
      {
        ja: "修験者の思いと、それを受け止めてきた地域の人々、そして葛城の自然や文化を楽しみに訪れる人々。その行き来が続く限り、葛城修験の歴史はこれからも刻まれていきます。",
        en: "As long as practitioners, the local communities that welcome them, and visitors drawn to Katsuragi's nature and heritage continue to cross paths, the story of Katsuragi Shugen will keep unfolding.",
      },
    ],
  },
];

/** One paragraph in a language, with the trail length filled in. */
export function storyParagraph(p: Pair, locale: "ja" | "en", km: number): string {
  return p[locale].replaceAll("{km}", String(km));
}
