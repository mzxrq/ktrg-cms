# Motion everywhere: design (2026-11-16, approved; stage 1 built)

## Why

Some screens feel unfinished next to the landing page: the menu eases open but vanishes when closed, dialogs snap in and out, empty and error states just appear, and page changes cut. The user wants motion across the whole app, ambitious but quick, that follows the visitor's motion level (full, fade only, or off).

## Decided with the user (2026-11-16)

- **Where:** everywhere, small and quick. Tools screens (menu, dialogs, toasts, lists, forms, admin) get short motion (150 to 300 ms); reading pages keep their longer editorial motion. `design-language.md` is amended in the first PR (its "Tools register: only the feedback that already exists" line and "GSAP reading pages only").
- **Levels:** three: **Full**, **Fade only**, **Off**.
- **Tool:** GSAP for everything (user's pick over CSS for small things).

## Goals / non-goals

- Goals: every element that appears or disappears (menu, dialogs, toasts, banners, sheets, empty and error states, lists, route changes) enters and leaves smoothly; one motion level honoured everywhere; no jank on a mid-range phone; nothing blocks a tap.
- Non-goals: no scroll hijacking, no parallax on words or photos, no loading screen in front of content, nothing that moves by itself without ending (all kept from the design language). No sound. No change to the landing journey's own choreography.
- Anti-goals: motion that delays a task (a person must never wait for an animation to finish before the next tap works); extra weight on first load.

## Levels (what each means)

| Level | Behaviour |
|---|---|
| Full | Move and fade (rise, slide, scale, stagger), all short. |
| Fade only | Opacity only, no movement, no scale, no stagger. |
| Off | Nothing animates; elements appear and leave at once (today's `calm`). |

- Stored as the existing preferences object (cookie, and the account's `preferences` JSON), so **no database migration**: add `fade: boolean` next to `calm`. `calm` stays "Off" (so every existing `data-calm` rule and the 26 files that read it keep working); `fade` is "Fade only" when `calm` is false. `calm` wins if both are set. `html[data-fade]` is the new attribute.
- Default with no saved choice: the device's `prefers-reduced-motion: reduce` gives **Fade only** (today it forces near-zero durations); otherwise Full. Visitors who had "Reduce motion" on become Off, unchanged.
- Control: the menu's 動きをへらす switch row becomes a 3-way row (ふつう / フェードだけ / なし; Full / Fade only / Off), same in the settings page.
- The API's preference checker (`apps/api/src/me/preferences.ts`) must accept `fade`.

## How it is built

- `lib/motion.ts` (client): `motionLevel()` (reads `data-calm`, `data-fade`, the device setting), and small helpers `enter(el, kind)` and `leave(el, kind): Promise<void>` that run a GSAP tween chosen by level and always resolve (Off resolves at once).
- GSAP stays out of the shared bundle: `lib/motion.ts` loads it with a dynamic `import("gsap")` and preloads it on idle after first paint (not at Off). If it is not ready on a tap, the element simply appears at once; the visitor never waits.
- `@gsap/react` is approved by the user but not installed in stage 1: its `useGSAP` needs GSAP loaded up front, and the helper loads it on idle. It will be added in the first stage that animates a lazily loaded component with scoped selectors (lists, stagger).
- Exit animations need the element to stay mounted while it leaves: a `usePresence(open)` hook returns `{ mounted, ref }` and unmounts after `leave` resolves (the pattern the toasts already use).
- The `menu-drop`, `menu-pop`, `toast-*` CSS keyframes are replaced as each piece moves to the helper.
- Respect: focus moves and Escape work immediately; an interrupted animation (tap during it) finishes at once; `inert`/`aria-hidden` set at the start of leaving.

## Staging (one PR each, each checked in a real browser at all three levels)

1. **Foundation + menu:** the `fade` pref and 3-way control, `lib/motion.ts`, `usePresence`, design doc amendment, menu close (phone drop-up, wide pop-out, backdrop fade).
2. **Overlays:** `ConfirmDialog` (native `<dialog>`), toasts, stamp pop-ups, bottom sheets and backdrops.
3. **States:** `EmptyState`, `Notice` / `OfflineNotice` / `StatusBanner`, `error.tsx`, `not-found.tsx`, loading skeletons, success and failure feedback on forms.
4. **Lists and page changes:** staggered list and card entrance, a soft route change (`template.tsx`), admin tables and editors.

## Approaches considered

- **A. GSAP for everything (chosen by the user):** one tool and consistent easing, fine control of exits and stagger. Cost: library weight and a first-tap race, handled by lazy load plus idle preload and instant fallback.
- **B. CSS for small things, GSAP for sequences (recommended earlier, not chosen):** lighter, no race, but two systems.
- **C. View Transitions API for route changes:** nice but uneven browser support; kept as a possible later step for stage 4, not a dependency.

## Left to the builder

Exact durations and easings per kind (within 150 to 300 ms; reuse `--ease-enter`, `--ease-leave`); which lists get stagger; the Japanese and English wording of the 3-way control and any new labels (hand-appended `.po`); contrast and focus tests unchanged.

## Risks

- Bundle and first-tap: measure the chunk, keep it out of the shared bundle, check a slow-device profile.
- Exits can trap focus or block taps if a tween never resolves: `leave` has a timeout that forces the final state.
- Fade-only users on `prefers-reduced-motion` now see fades they previously did not: this is intended, noted in the amended design doc.
