# Rally redesign (2026-11-16)

Why: the rally page was a list of places with a status, and a visitor who had not started saw "0 / N, no stamps yet". Neither
invites anyone to walk. Goal: a page that explains the whole walk at a glance, and a first card that makes the first step feel small.

## Settled with the user (from mockups)

- **Trail first.** `/rallies/[id]` shows the whole course as a dotted path; each place is a card (photo, name, km, stamped / next / not yet) and a walker marker stands at the visitor's place.
- **Book page on tap.** A place opens as a book page rising over the trail: photo, name with reading, one short description, a line of history, distance and time to the next place, status note, the stamp (or its date), how to get there, the nearest toilet. Flip with ‹ ›; the walker on the trail moves as you flip. Close returns to the trail.
- **First-time card.** Rally name, first stop's photo, three facts (places, km, walking time; from real course data, never typed), the walker at the start of a dotted path, "さあ、最初の一歩へ", one button. After the first stamp the card shows progress and the next place.
- **Plain version = same screens, motion levels.** Full: rise, flip, walker walks. Fade only / Off: pages change at once, the walker stands at the next place. No separate switch (see `docs/motion-design.md`).
- Rallies leave the plain "tools" register for this: photos and a drawn walker are allowed on the rally pages. Our own drawing only, no AI images.

## Staging

1. **Data and first-time card (built).** `RallyItem.routeIds`; `lib/rally-journey.ts` (`journeyFacts`: places, km, time rounded to 5 min, first photo among the rally's courses); `JourneyFacts`, `Walker`; used on `/rallies` (FeaturedRally) and `/rallies/[id]` when nothing is stamped.
2. Trail view with place cards and the walker marker (needs per-place photo, description, km between places; extend `GET /rallies/:id`).
3. Book page sheet with flip (adds history, access, nearest toilet from the places directory; only places with a checked position).
4. Walker and flip motion at the three levels.
5. `/rallies` list cards.

## Left to the builder

The mound rally spans many courses: its totals add all of them. A course whose km or time is empty adds nothing; with none known the tile is left out.
