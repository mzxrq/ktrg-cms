# Rewriting the app's text (Japanese, English, Thai)

A working guide for rewording every text in the app by hand, page by page, without losing any of it.
Written 2026-11-24 for PR #622. All commands run from the repository root unless they say `--cwd`.

## 1. Where the text lives

| # | What | Where | How you save it |
|---|------|-------|-----------------|
| A | Screen text (buttons, headings, hints, errors), about 2,000 messages | In the code as `` t`…` ``, `<Trans>…</Trans>`, `` msg`…` `` in `apps/web/src`; the translations in `apps/web/src/locales/en.po` and `th.po` | Edit the Japanese in the code; the English and Thai in the `.po` files (section 2) |
| B | Text kept in code outside Lingui | `apps/web/src/lib/story-text.ts` (the /story page), `lib/origin-places.ts`, `lib/admin/content-locales.ts`, `app/(public)/story/page.tsx`; in the API: the admin lists' labels and hints (`{ ja: "…", en: "…" }` in 15 files: `places/place-directory.ts`, `posts/*-list.ts`, `banners/banner-list.ts`, `users/user-list.ts`, `stamps/stamp-list.ts`, `audit/audit-labels.ts`, `audit/audit-list.ts`, `content/place-list.ts`, `furigana/furigana-words.ts`, `notices/notice-routes.ts`, `posts/comments.ts`, `db/translations.ts`, `emails/layout.ts`), and the emails in `apps/api/src/emails/*.ts` | Edit the `ja:` and `en:` side by side in the file. No extract needed. Japanese and English only |
| C | Content (courses, waypoints, places, posts, pages, banners, home text, notices) | The database | The admin screens, as usual. Not part of the code change |
| D | Starting data | `apps/api/src/db/seed-data.ts` | Only matters for a fresh database; leave it unless a name is wrong |

Most of the work is A, then B. C is done in the admin whenever you like and is not in the PR.

## 2. The rules that keep text from disappearing

**Japanese is the message's name.** In the `.po` files each message is found by its Japanese text (`msgid`), and its English or Thai is the `msgstr` under it. `lingui:extract` runs with `--clean`, so:

> **When you change a Japanese text in the code, its English and Thai are deleted at the next extract.** Putting the Japanese back does not bring them back.

So always work in this order, one small batch at a time:

1. **Japanese first**, in the code (`` t`…` `` / `<Trans>`). Change nothing in the `.po` files yet.
2. **Extract**: `bun run --cwd apps/web lingui:extract`.
3. **Check**: `bun run --cwd apps/web check:catalogs`. For every message whose Japanese you changed it prints the old Japanese, its old English (and Thai), and the new message to give it to, like this:
   ```
   src/app/(public)/places/[id]/page.tsx
     was:  近くの道
     en:   On the trail nearby
     now?: この場所の近くの道
   ```
   It fails (exit 1) while any message has no English.
4. **Write the English (and Thai)**: open `apps/web/src/locales/en.po` (and `th.po`), search for the new Japanese, and type the translation between the quotes of its `msgstr ""`. Edit only `msgstr` lines, never `msgid` or the `#:` lines.
5. **Extract and check again** until `check:catalogs` says `English catalog is complete.`
6. **Commit** (section 4).

If something went wrong:

- **You changed a Japanese text back to how it was**, and its English is gone: `bun run --cwd apps/web check:catalogs --restore` writes the old translation back for every message whose Japanese is again exactly what it was at the last commit.
- **You want the list for the whole branch**, not just since the last commit: `bun run --cwd apps/web check:catalogs --against origin/main`.
- **Nothing is lost until you commit.** The last commit still has every translation; the check compares with it.

Details that matter in the `.po` files:

- Keep every `{0}`, `{name}`, `<0>…</0>` exactly as in the Japanese. They are filled in by the app (a number, a name, a link). You may move them within the sentence.
- A message with `{count, plural, …}` keeps its shape; English needs `one` and `other`, Thai only `other`.
- A message used on several pages is one entry: rewording it changes every page. Look at its `#:` lines to see where it is used.
- To see all messages of one file: search `en.po` for `#: src/components/SpotSheet.tsx`.

## 3. Order of work

Do the shared pieces first: they appear on every page, so every later page already reads right around them. The number is how many messages the file or folder has.

### Phase 1. Shared by every page

- `components/SiteHeader.tsx` (35), `TabBar.tsx` (9), `SiteFooter.tsx` (7), `app/(public)/error.tsx` (4), `not-found.tsx` (3), `app/offline/page.tsx` (4)
- Error messages: `components/useErrorMessages.ts` (66), stamp messages: `components/useStampMessages.ts` (18)
- Small parts: `ConfirmDialog`, `Breadcrumb`, `Pager`, `StatusWord`, `StatusBanner`, `PointKindName` (15), `PrefectureName`, `InstallNudge`, `InstallSteps` (13), `BrowserWarning`, `OfflineNotice`

### Phase 2. Visitor pages, in the order a walker meets them

| Page | Address | Main files |
|------|---------|------------|
| Home | `/` | `components/landing/*` (90), `app/(public)/page.tsx` |
| Story | `/story` | `lib/story-text.ts` (outside Lingui, B) |
| Courses list | `/routes` | `app/(public)/routes`, `RoutePill`, `PrefectureFilter` |
| Course | `/routes/<id>` | `RouteView` (14), `RouteStats` (21), `RouteJourney` (11), `JourneyFacts`, `StopList` (11), `ElevationChart` (20), `ElevationProfile`, `AccessList`, `ShareRoute`, `OfflinePack` (15) |
| Map | `/map` | `components/map/*` (132) |
| Navigation | (from a course) | `components/navigation/*` (105) |
| Stop | `/spots/<id>` | `SpotSheet` (13), `SpotStats` (14), `StampHere` (19), `SpotGallery`, `NearbyPlaces` |
| Shops and facilities | `/places`, `/places/<id>` | `app/(public)/places`, `components/places/*`, `PlaceFacts`, `PlaceDialog` |
| Rallies | `/rallies`, `/rallies/<id>` | `RallyViews` (21), `RallyBook` (12), `RallyNearbyStamp` (16), `RallyTrail`, `StampGrid`, `StampLegend`, `StampOutbox` (11), `StampProgressPopup`, `CertificateButton` |
| Badges | `/badges` | `app/(public)/badges` |
| Blog and pages | `/blog`, `/p/<slug>` | `app/(public)/blog`, `components/blog/*` |
| Notices, status | `/notices`, `/status` | `app/(public)/notices`, `StatusChecks` |
| Grading, guide, FAQ | `/grading`, `/guide`, `/faq` | `app/(public)/grading`, `guide`, `faq` |
| Sign-in | `/login`, `/register`, `/restore`, `/welcome` | `components/auth/*` (83), `GuestBackup`, `GuestClaim`, `GuestNag`, `RestoreStamps`, `SignInPrompt` |
| My page and settings | `/profile`, `/settings`, `/bookmarks` | `ProfileSettings` (28), `ProfileCard`, `ProfilePhoto`, `components/settings/*` (87), `ThemeSwitcher`, `MotionSelect`, `BookmarkList` |
| Site map, terms, privacy | `/sitemap`, `/terms`, `/privacy`, `/licenses` | `app/(public)/sitemap` (27), `terms`, `privacy`, `licenses`, `PrivacyNote` |

### Phase 3. Admin, by menu group (about 1,400 messages)

Biggest files first inside each group:

- **コースとラリー**: `admin/map-editor/MapEditor.tsx` (135), `RouteEditor.tsx` (93), `PlacePanel.tsx` (86), `map-editor/PlaceList.tsx` (49), `RallyEditor.tsx` (42), `RouteImport.tsx` (33), `one-map/OneMap.tsx` (30)
- **サイトの内容**: `BlockEditor.tsx` (48), `PageTextEditor.tsx` (28), banners, home
- **コミュニティ**: `CommentInbox.tsx` (30), users, `UserActions.tsx` (27)
- **運営**: `SiteSettingsForm.tsx` (38), visits, the change log
- The admin frame: `AdminNav`, `AdminProfileMenu`, `AdminPageHeader`
- Then the admin list labels in the API (section 1, B). They are Japanese and English pairs in the API code, shown on the list and form screens.

### Phase 4. Outside Lingui (B)

Emails (`apps/api/src/emails/*.ts`: login code, re-check code, passkey and password alerts, deletion), `story-text.ts`, `origin-places.ts`. Each has its `ja` and `en` next to each other. Some API tests check email wording: run the tests after each change.

### Phase 5. Content (C)

In the admin, at any time. Not in the PR.

## 4. Before each commit

```
bun run --cwd apps/web lingui:extract
bun run --cwd apps/web check:catalogs     # must end with "English catalog is complete."
bun run typecheck
bun run lint
bun run test                               # judge by the exit code, not the summary line
```

A few tests compare visible text (for example `grep -rlE "getByText|toContain" apps/web/src --include=*.test.ts*`). When one fails after a rewording, change the test's expected text to the new wording.

CI fails when the `.po` files differ from what extract writes, so always run extract last before committing. Commit per page or per few files: small commits are easy to check and easy to undo.

## 5. Writing so it does not sound "AI"

Japanese:

- Say it once and short. Prefer 「保存しました」 to 「保存が完了いたしました」, 「〜できます」 to 「〜することができます」.
- Drop filler: 「ぜひ」「さまざまな」「〜となっております」「〜させていただきます」 are rarely needed.
- One sentence, one point. A button is a verb (「保存する」「公開する」), never a sentence.
- Keep the team's words (CLAUDE.md, "Visitor vocabulary" and "Admin vocabulary"): コース (never ルート), 経由地, 下書き, 公開する, 公開をやめる, 権限, 場所 only for the directory.
- Write as the site's own voice, plain and polite (です・ます), the way a ranger would explain it at a trailhead.

English:

- Plain words: "Save", "Show on map", "You're offline". Avoid "Discover", "Embark", "Seamless", "Unlock", "Journey through", "Dive in".
- No exclamation marks, no lists of three for rhythm, no dashes stuck between clauses.
- Sentence case for headings ("Nearby trails", not "Nearby Trails").
- Translate the meaning, not the words: an English reader needs less politeness and fewer words than the Japanese.

Both:

- The same thing has the same name everywhere. Keep a short word list as you go (Japanese, English, Thai).
- Read it aloud. If you would not say it to a walker standing next to you, rewrite it.
- The text is read by people over 70 too: short sentences, no jargon, no abbreviations.

## 6. Thai (preview only)

Thai is switched off for visitors. It appears only where `NEXT_PUBLIC_PREVIEW_LOCALES=th` is set when the web app is built or started:

- **On your PC**: add `NEXT_PUBLIC_PREVIEW_LOCALES=th` to your own env file, restart `bun run dev:web`, and pick ไทย in the language menu.
- **On a Vercel preview**: Project > Settings > Environment Variables, add it for **Preview only**, then redeploy the preview. **Never for Production.**
- Without it, the Thai catalog is still kept up to date by extract, but nobody can choose Thai and a `locale=th` cookie is ignored.

How to write it: the same as English, in `apps/web/src/locales/th.po`. Every Thai `msgstr` you leave empty shows the English (and the Japanese only where there is no English either), so you can translate a page at a time. `check:catalogs` prints how many are left but does not fail on Thai.

Not Thai yet (it shows English for now; later work, not in this PR):

- **Content from the database** (course and place names, descriptions, posts). The admin can already store Thai, but the public API only sends Japanese and English.
- **The admin list labels and the emails** (section 1, B): Japanese and English only. A Thai reader gets the English, and Thai sign-ins get English emails.
- **Japanese-only behaviour**: about 100 places in the code check `locale === "ja"` or `locale === "en"` (`grep -rnE '!== "en"|=== "ja"|=== "en"' apps/web/src`). A Thai reader can get the Japanese behaviour there: furigana, vertical headings, Japanese date wording. Note what looks wrong while testing; it gets fixed before Thai goes public.
- **Dates** in Thai use the Buddhist year (2569). That is correct for Thai readers; say so if you want Western years.
- The account's saved language stays Japanese or English.
