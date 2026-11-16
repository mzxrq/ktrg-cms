# Plan: navigation v2 (a big refinement of map navigation)

Status: **plan only** (2026-11-16). Builds on `docs/navigation-plan.md` (v1, 2026-11-04) and
`docs/navigation-transit-plan.md`. No app code until the user says go.

## What the user said (2026-11-16)

- Some navigation features are buggy on Android (the user now has an Android phone; a Huawei with Google services was also tried).
- "We have to refine, redo, plan a massive improvement for the maps navigation."
- **A modal that makes the walker scroll down to reach its buttons is not acceptable.**
- Test every change on Android, iOS and desktop.

## What is there today (from the code)

| Piece | File | Note |
|---|---|---|
| Toast at the bottom while navigating (turn sign, distance, stop) | `components/navigation/NavigationHud.tsx` (485 lines) | reports its height as `--nav-toast` |
| Arrival card (photo, stamp button, later) | `NavPrompts.tsx` | `max-h-full overflow-y-auto`: **the photo pushes the stamp button below the fold on a short screen** |
| End-navigation confirm | `NavPrompts.tsx` | short, fits |
| Far from the course (transit, links) | `NavFarCard.tsx` | `max-h-[85dvh] overflow-y-auto`, buttons at the end: **scrolls** |
| Pick another target | `NavTargetPicker.tsx` | `max-h-[80dvh] overflow-y-auto`, long list, close at the end: **scrolls** |
| Finger-gesture help | `components/map/MapHelp.tsx` | full screen, fine |
| Position | `lib/navigation/position-watcher.ts` | `watchPosition`, high accuracy, paused when hidden (CLAUDE.md rule) |
| Voice and vibration | `useNavVoice.ts`, `lib/navigation/voice.ts` | `speechSynthesis`; `navigator.vibrate` (Android yes, iOS no) |
| Compass heading | none | the map never turns with the phone |
| Wake lock | none | v1 planned a toggle; not built |

## Rule 1: no scrolling dialogs

Every navigation dialog follows one shape, on the smallest supported screen (360 × 640 css px, Android with the address bar
and the chin) and at the largest text size:

1. **The buttons are always on screen**: a footer pinned to the bottom of the dialog (`sticky bottom-0`, solid background),
   never at the end of a scrolling body.
2. **The main action first and biggest** (スタンプを押す, つぎへ進む), at least 56 px tall, in thumb reach.
3. **Pictures give way**: a photo is at most 30 % of the dialog height and is the first thing to drop on a short screen
   (`max-height` query), never the buttons.
4. Long lists (the target picker) scroll **inside** a box between a fixed header and a fixed footer, so 閉じる never moves.
5. A source test (like `lib/tabbar-edge.test.ts`) fails if a navigation dialog has its action buttons inside the scrolling body.

## Android: what to check first (needs the user's phone)

The bugs were not described one by one yet, so v2 starts with a short checklist on the real phone. Each item has a likely cause to check:

- **Bottom bar / toast under the system navigation bar** (Chrome 135+ edge-to-edge): the tab bar is fixed in #552; the
  toast (`--nav-toast`) and the stamp button above the tab bar need the same `safe-area-max-inset-bottom` pattern.
- **Position stalls after the screen locks**: Android throttles a hidden page more than iOS; resume must re-request a fix and
  show the age (exists, verify).
- **Voice**: Android voices load late (`voiceschanged`); the first phrase may be silent or in the wrong language.
- **Back button**: Android's system back should close an open dialog, not leave the map (dialogs need a history entry or
  `closedby`/`cancel` handling).
- **Keyboard and resizing**: `interactive-widget` in the viewport tag decides whether the keyboard resizes the page.
- **Huawei without Google services**: no Google location service; positions come from the browser's own provider and may be
  slower or rougher. Show accuracy honestly; never block.

## Target experience (v2)

- **One screen, nothing to scroll while walking.** Top: the next instruction big. Bottom: one strip with progress and the
  main action. The map in between.
- **Heading-up with a compass (optional)**: `deviceorientationabsolute` on Android, `webkitCompassHeading` on iOS (needs a
  permission tap); north button always visible; off by default where the sensor is unreliable.
- **Wake lock toggle** (v1 plan): on by default in navigation mode, with a battery note.
- **Arrival**: the strip itself turns into a big スタンプを押す; the photo is optional and small; no separate scrolling card.
- **Far from the course**: a compact card, the two or three ways to get there as large rows, links open outside; buttons fixed.
- **Target picker**: a bottom sheet with a fixed header (閉じる, 近い順にもどす) and a scrolling list between them.
- **Same look in every register**: the tools register (plain, fast motion only, `docs/motion-design.md`).

## Slices (one PR each, never stacked)

1. **N2-1 Dialog shape**: pinned footers and photo limits for `NavPrompts`, `NavFarCard`, `NavTargetPicker`; the source test. **Built 2026-11-16** (also the end confirm; `lib/nav-dialogs.test.ts`; the photo hides below 34rem of height).
2. **N2-2 Android bottom insets**: toast and floating buttons use the max-inset pattern; system back closes dialogs. **Built 2026-11-16**: `--bar-inset` (the system bar the tab bar adds) for the panel and the コースにもどる button; Android back closes the arrival card (= あとで) and the passed card (= 次へ進む) via CloseWatcher. Also the wake lock on/off switch (☀, on by default, battery note in the label and the map help; side agent and CLAUDE.md: behind a toggle).
3. **N2-3 Android checklist fixes**: whatever the user's phone shows from the list above (voice, resume, Huawei position).
4. **N2-4 Arrival in the strip**: the stamp moment without a card. **Built 2026-11-16**: `ArrivalStrip` (small photo, 着きました, name, credit) takes the progress line's place, the stamp button right under it; no あとで (nothing covers the map).
5. **N2-5 Wake lock and compass**: built first (2026-11-16, user asked why the map would not turn): heading-up from the phone's compass while following, wake lock on during navigation; browser APIs only, no library. A toggle is left for later if the compass misbehaves on a phone.
6. **N2-6 Target picker as a sheet.** **Built 2026-11-16**: bottom sheet on a phone (slides up; fade only fades; calm shows it at once), centred box from 768 px, closes on a tap on the dimmed map.

Each slice: Android (Chrome, the Huawei), iOS (Safari and the installed app), desktop; smallest screen and largest text size.

## Open questions for the user

- **Q1:** which Android bugs did you see? (a list or screenshots; this decides N2-3) — open.

## Answered (user, 2026-11-16)

- **Q2 photo on arrival:** keep the photo (it still gives way to the buttons on a short screen, rule 1).
- **Q3 compass:** yes, heading-up with the compass (N2-5 is no longer optional; north button stays).
- **Q4 wake lock:** on by default in navigation.
- **Also asked:** the map comes to where the walker is (done with the map-look PR: far from the course the frame holds the
  walker and the course); the course line was barely visible (now deep magenta, thicker when zoomed in); GSI's tiles read
  too bright and colourful (calmer built-in look; a calmer tile style would be a new provider, needs a yes).
