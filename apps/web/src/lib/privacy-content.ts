// The privacy policy text, in both languages. It is a DRAFT written from what the app actually does (CLAUDE.md,
// "Privacy" and the data model). It has to be read by whoever handles legal matters before launch: the email
// delivery provider name is not decided yet and is marked as such, never invented.
// Keep it true: when the app starts collecting or sharing something new, change this text in the same change.

export interface PolicySection {
  heading: string;
  paragraphs?: string[];
  /** A list of "term: explanation" rows. */
  items?: { term: string; text: string }[];
}

export interface Policy {
  title: string;
  /** Shown at the top while the text is still a draft. */
  draftNotice: string;
  updated: string;
  sections: PolicySection[];
}

const ja: Policy = {
  title: "プライバシーポリシー",
  draftNotice: "このプライバシーポリシーは草案です。公開前に内容を確認します。",
  updated: "2026年11月28日（案）",
  sections: [
    {
      heading: "このページについて",
      paragraphs: [
        "このアプリ（葛城修験スタンプラリー）で取り扱う情報と、その利用目的をまとめています。アカウント登録時のアンケート項目は、回答したくない場合スキップできます。",
      ],
    },
    {
      heading: "運営者・お問い合わせ先",
      items: [
        {
          term: "運営者",
          text: "一般財団法人奈良遺跡文化財保存活性化財団（〒639-0223 奈良県香芝市真美ケ丘1-6-25）",
        },
        {
          term: "お問い合わせ先（開発・窓口）",
          text: "株式会社エヌ・ディ・アール（〒550-0011 大阪市西区阿波座2-1-1 CAMCO西本町ビル2階 / TEL: 06-6539-2111 / お問い合わせフォーム: https://ndr.co.jp/contact/）",
        },
      ],
    },
    {
      heading: "取得する情報と利用目的",
      items: [
        { term: "メールアドレス", text: "メールでのログインを利用される方のみ取得します。ログイン用の認証コードを送信するために使用します。" },
        { term: "パスキー", text: "パスキーで登録された方の公開鍵のみを保存します。顔や指紋などの生体情報が端末の外へ送信されることはありません。" },
        { term: "パスワード", text: "パスワードを設定された方のみ保存します。復元できない形式（ハッシュ化）に変換したもののみを保存し、パスワード自体は保存しません。" },
        { term: "お名前（ニックネーム）", text: "アプリ内での表示に使用します。ニックネームでも登録できます。" },
        {
          term: "お住まいの地域・年代・性別",
          text: "いずれも任意項目で、回答しなくてもアプリをご利用いただけます（「回答しない」も選択できます）。ご利用者層を把握するため、個人を特定できない形で集計します。年代が70代以上の方は、ナビ機能の音声案内が初期設定でオンになります（ナビ画面でいつでも変更できます）。これら以外の目的には使用しません。",
        },
        { term: "言語・表示設定", text: "ご希望の表示状態を保つために保存します。" },
        { term: "スタンプの獲得履歴", text: "どのスポットで、いつ、どの方法でスタンプを獲得したかを保存し、スタンプ帳や達成状況の表示に使用します。" },
      ],
    },
    {
      heading: "位置情報",
      paragraphs: [
        "位置情報は、スタンプを獲得する際にスポットの近くにいるかを確認するために使用します。送信された位置情報自体は保存せず、スタンプの獲得履歴のみを記録します。",
        "ナビ機能のご利用中、コースから外れている間は、迂回ルートを表示するため数十秒おきに現在地を外部サービス（OpenRouteService）へ送信します。位置情報は保存せず、ルート表示後に破棄します。",
        "電波がつながらない場合は、スタンプの送信データを端末内に一時保存し、通信の回復後に送信します。送信完了後、端末内の一時データは削除されます。",
        "本アプリが移動履歴を継続的に記録することはありません。",
      ],
    },
    {
      heading: "アクセス地域の集計",
      paragraphs: [
        "ページが開かれるたびに、接続元から推定されるおおよその地域（国・都道府県・市区町村）と閲覧されたページを集計します。どの地域の方が本プロジェクトに関心を持っているかを把握し、広報や運営に活かすためです。",
        "プロフィールで「お住まいの地域」に回答していない場合でも、接続元からおおよその市区町村までが集計されます。市区町村より細かい位置は分かりません。本アプリがIPアドレスを読み取ったり保存したりすることはなく、ホスティング事業者が付与する地域情報のみを参照します。",
        "IPアドレス自体は保存・記録しません。保存するのは「日別・地域別・ページ別の閲覧回数」のみで、アカウントやスタンプ履歴とは紐づけず、個人を特定できる形では扱いません。地域は接続元から推定するため、実際の現在地と異なる場合があります。",
        "ブラウザで「Do Not Track」または「Global Privacy Control」を有効にしている場合は、閲覧回数のみを数え、地域の集計は行いません。アクセス数の少ない市区町村は名称を表示せず合算し、閲覧者からも個人が特定されないようにしています。",
      ],
    },
    {
      heading: "アカウントの制限と不正確認",
      paragraphs: [
        "他の利用者への迷惑行為やスタンプの不正取得が疑われる場合、運営者がアカウントを制限することがあります。制限されたアカウントは閲覧のみ可能となり、スタンプ獲得などの参加機能が利用できなくなります。制限は期限付き、または解除されるまで継続する場合があります。",
        "この管理のため、制限開始日時・終了日時・運営者による理由メモを保存します。理由メモは管理者のみが閲覧でき、他の利用者には表示されません。制限の解除またはアカウント削除時にこれら3項目は削除されますが、制限を実施した事実自体は管理者用の変更履歴に残ります。",
        "不正が疑われるスタンプは自動的にブロックせず、運営者が確認できるようフラグを付け、確認のうえで取り消す場合があります。このフラグを閲覧できるのは管理者のみです。",
      ],
    },
    {
      heading: "Cookieなどの保存",
      paragraphs: [
        "ログイン状態の維持や、言語・表示設定、オフライン時の一時データを保持するため、Cookieやブラウザの保存領域を使用します。広告配信や行動追跡を目的としたCookieは使用しません。",
      ],
    },
    {
      heading: "外部サービス",
      items: [
        { term: "地図", text: "地図を表示する際、国土地理院の地図データを読み込むため、お使いの端末の接続情報（IPアドレス等）が同サービスへ送信されます。" },
        { term: "動画", text: "動画は再生ボタンを押したときにのみYouTubeから読み込みます。" },
        { term: "ナビ機能", text: "コースから外れている間の迂回ルート表示のため、現在地をOpenRouteServiceへ送信します。位置情報は保存しません。" },
        { term: "利用状況の集計", text: "ホスティング事業者（Vercel）の集計機能と、上記の「アクセス地域の集計」により、ページ閲覧数などを個人を特定できない形で集計します。いずれもCookieは使用しません。" },
        { term: "メール送信", text: "ログイン用の認証コードはメール配信事業者を通じて送信します。事業者名は公開までに記載します。" },
      ],
    },
    {
      heading: "第三者への提供",
      paragraphs: [
        "法令に基づく場合を除き、ご本人の同意なく個人を特定できる情報を第三者へ提供しません。個人を特定できない統計データは、アプリの改善や主催者への報告に使用することがあります。",
      ],
    },
    {
      heading: "情報の確認・変更・削除",
      paragraphs: [
        "お名前、お住まいの地域、年代、性別は、アカウント設定からいつでも変更できます。",
        "アカウントおよび記録の削除をご希望の場合は、上記の「お問い合わせ先」までご連絡ください。",
      ],
    },
    {
      heading: "プライバシーポリシーの変更",
      paragraphs: ["内容を変更する場合は、このページでお知らせします。"],
    },
  ],
};

const en: Policy = {
  title: "Privacy Policy",
  draftNotice: "This Privacy Policy is a draft and will be reviewed before launch.",
  updated: "November 28, 2026 (draft)",
  sections: [
    {
      heading: "About this policy",
      paragraphs: [
        "This page explains what information the Katsuragi Shugendō Stamp Rally app collects and how it is used. Any optional questions during sign-up can be skipped.",
      ],
    },
    {
      heading: "Operator and contact",
      items: [
        {
          term: "Operator",
          text: "Nara Kofun & Heritage Foundation (1-6-25 Mamigaoka, Kashiba, Nara 639-0223, Japan)",
        },
        {
          term: "Contact (Development & Inquiries)",
          text: "NDR Co., Ltd. (2F, CAMCO Nishi-Hommachi Building, 2-1-1 Awaza, Nishi-ku, Osaka 550-0011, Japan / Tel: +81-6-6539-2111 / Website: https://ndr.co.jp/en/)",
        },
      ],
    },
    {
      heading: "Information we collect and why",
      items: [
        { term: "Email address", text: "Collected only if you log in with email. Used solely to send your login verification code." },
        {
          term: "Passkey",
          text: "If you register a passkey, we store only its public key. Biometric data such as Face ID or fingerprints never leaves your device.",
        },
        { term: "Password", text: "Stored only if you set one. We store a one-way cryptographic hash that cannot be reversed, never your actual password." },
        { term: "Display name", text: "Shown inside the app. A nickname is completely fine." },
        {
          term: "Region, age range, and gender",
          text: "All optional—the app works without them, and \"Prefer not to say\" is available. We aggregate this data anonymously to understand who uses the app. If you select age 70 or over, navigation voice guidance starts turned on by default (you can toggle it anytime on the navigation screen). This information is not used for any other purpose.",
        },
        { term: "Language and display settings", text: "Saved so the app remembers your display preferences." },
        { term: "Stamp history", text: "Records which spots you stamped, when, and how, so we can display your stamp book and progress." },
      ],
    },
    {
      heading: "Location data",
      paragraphs: [
        "Your location is checked when you collect a stamp to verify that you are near the spot. Your coordinates are not stored—only the resulting stamp record is saved.",
        "During navigation, while you are off the course line, your location is sent roughly every 30 seconds to an external routing service (OpenRouteService) to draw a detour route. Your location is not stored and is discarded once the route is generated.",
        "When you have no signal, pending stamps are temporarily stored on your device and sent once you are back online, then removed from your device.",
        "This app never tracks or records your movement history continuously.",
      ],
    },
    {
      heading: "Regional access analytics",
      paragraphs: [
        "Each time a page is viewed, we record the approximate region associated with the connection (country, prefecture or state, and city or town) alongside the page viewed. This helps us understand regional interest in the project for outreach and operations.",
        "Even if you leave your region blank in your profile, this aggregate count includes an approximate city or town level. It never goes finer than city or town. The app never reads or stores your IP address; the region comes solely from headers provided by our hosting platform.",
        "IP addresses are never stored or logged. We keep only daily counts per region and per page, never linked to your account or stamps and never handled in a way that identifies you. Because regions are estimated from network connections, they may differ from your actual location.",
        "If your browser sends \"Do Not Track\" or \"Global Privacy Control\", we count only the page view and do not record any region. Cities and towns with very few visits are grouped into an unnamed total so no individual can be singled out.",
      ],
    },
    {
      heading: "Account restrictions and stamp review",
      paragraphs: [
        "If an account disrupts other users or shows suspected stamp abuse, the operator may restrict it. Restricted accounts can still browse the app but cannot participate in activities such as collecting stamps. Restrictions may have an expiration date or remain until lifted.",
        "To manage restrictions, we store the start time, expiration date, and an internal reason note written by staff. Only administrators can view this note; other users cannot. These three fields are deleted when the restriction is lifted or the account is deleted, though the administrative change log retains a record that a restriction occurred.",
        "Suspected irregular stamps are not blocked automatically. They are flagged for staff review and may be revoked after verification. Only administrators can view these flags.",
      ],
    },
    {
      heading: "Cookies and local storage",
      paragraphs: [
        "We use cookies and local browser storage to keep you logged in, remember your language and display settings, and hold offline data temporarily. We do not use advertising or cross-site tracking cookies.",
      ],
    },
    {
      heading: "Third-party services",
      items: [
        {
          term: "Maps",
          text: "Displaying maps loads map tiles from the Geospatial Information Authority of Japan (GSI), which receives standard connection details (such as your IP address) to deliver the tiles.",
        },
        { term: "Videos", text: "Videos are loaded from YouTube only when you press play." },
        { term: "Navigation", text: "While you are off-course during navigation, your location is sent to OpenRouteService to calculate a detour route. Your location is not stored." },
        { term: "Usage analytics", text: "Our hosting provider's analytics (Vercel) and the regional access counts described above tally page views anonymously. Neither uses cookies." },
        {
          term: "Email delivery",
          text: "Login verification codes are sent through an email delivery provider. The provider's name will be added here before launch.",
        },
      ],
    },
    {
      heading: "Sharing with third parties",
      paragraphs: [
        "Except where required by law, we never share personally identifiable information with third parties without your consent. Anonymized aggregate statistics may be used to improve the app or report to project organizers.",
      ],
    },
    {
      heading: "Viewing, updating, and deleting your data",
      paragraphs: [
        "You can update your display name, region, age range, and gender at any time from Account Settings.",
        "To request deletion of your account and associated records, please reach out using the contact details listed above.",
      ],
    },
    {
      heading: "Changes to this policy",
      paragraphs: ["Any updates to this policy will be posted on this page."],
    },
  ],
};

export function privacyPolicy(locale: string): Policy {
  return locale === "ja" ? ja : en;
}