# One-map editor: every course and place on one admin map

Status: **steps 1 to 4 built** (#577, #587, #590, step 4 = edit a course in place on the one map); steps 5 and 6 are design (updated 2026-11-17 with the user's answers and the map editor redesign).

## What the user asked (2026-11-17)

> To streamline the places directory, make one single map editor that shows every place, with a switch for "edit this course":
> the map then opens that course's list without switching pages, calling the data and editing it in one place. Keep the
> separate pages for people who have built the muscle memory.

## Decided (user, 2026-11-17)

1. **The map shows every course and the places directory**: each course's line and waypoints, and every お店と施設 place.
2. **"Edit this course" edits everything** the course editor's map can: waypoints and their details, the line and the legs.
3. **The current screens stay** (コース > a course, 場所の一覧 > a place). The new map is an extra way in, not a replacement.
4. **Menu name: 地図** (コースとラリー > 地図).
5. **Other courses while one is edited: faint** (thin, muted lines; their waypoints hidden or tiny), never hidden.
6. **Draft and unchecked places are shown**, with the same draft look as the course editor.
7. **A new course can be made from the map** (2026-11-18; the earlier "no" answered "out of scope?", so it is in scope). A 新しいコース button on the map starts an empty course in place: draw or snap its line there, give it a name, save; it then opens like any course. コース > 新しいコース stays too.
8. **A course selector**: too many waypoints on one map is confusing, so choosing a course raises its waypoints above everything else and moves the map to that course's area, ready to edit.

## What exists today, and what we reuse

| Piece | Today | In the one map |
|---|---|---|
| `MapEditor` (1,267 lines) | A **controlled** map: it draws the course draft it is given and reports every edit (`onMovePlace`, `onSetLeg`, ...) | Reused as is for the course being edited |
| `RouteEditor` | Owns the course page's tabs and form | Its state and save now live in the hook `useRouteDraft` (#577), shared with the one map |
| `PlacePanel` | The waypoint's form | Reused for the selected waypoint |
| `AdminItemForm` with `PositionMap` | A directory place's form, on its own page | Opened under the map for a selected directory place (`onSaved` / `onRemoved`, as the banners do since #570) |
| `useDiscardCheck` (#570) | Asks before an in-place form drops unsaved changes | Asked before switching course or place |

## The screen

`/admin/map` (menu: コースとラリー > 地図). Desktop first (`lg:`), like the rest of the admin.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [コースを選ぶ ▾ 1 友ヶ島と加太周辺] [このコースを編集する] [☐ 場所の一覧も表示] │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   the chosen course: its line and numbered waypoints on top, full colour │
│   every other course: thin, muted line, no waypoint markers              │
│   directory places (when shown): small category icons                   │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│  the chosen course's waypoint list (with none chosen: the course list),  │
│  full width under the map                                                │
└──────────────────────────────────────────────────────────────────────────┘
```

- **The course selector** (a drop-down with every course by number and name; tapping a course's line chooses it too): the chosen course's line and waypoints are drawn **above** everything else, the map **flies to its area** (the course's bounds, with padding), and the list under the map becomes its waypoint list. Other courses stay faint underneath (decided 5). すべて goes back to the overview.
- **Editing** (このコースを編集する): that course's draft is loaded (the same data as its course page), the map becomes `MapEditor` for it (its toolbar, legs, drag), and a save bar at the top saves the course (the same steps as the course page). Picking another course, or すべて, asks first when there are unsaved changes.
- **A directory place:** tapping it opens its form under the map (position, details, publish). Dragging its marker moves it (the same check rule as today: the position stays unchecked until a person ticks 位置を確認した).
- **Only one thing is edited at a time**: one course or one directory place. That keeps saving, undo and conflicts exactly as they are today.
- A link to the course's own page and the place's own page stays in the panel, for anyone who wants the full form.
- Drafts and unchecked places are drawn with the course editor's draft look (decided 6).

Phones: the admin is desktop first; on a narrow screen the page says to use a wider screen, and links to the usual lists.

## The course editor's map, made easier (user, 2026-11-17)

The same `MapEditor` and `PlaceList` serve the course page's 地図と線 tab and the one map, so these changes reach both.

**The list moves under the map.** Today the map and the waypoint list sit side by side (`xl:grid-cols-[minmax(0,1fr)_25rem]`) and both are cramped. The map takes the full width; the list follows below it, full width (two columns of rows on a very wide screen).

**Buttons become icons.** The list's text chips are fine in Japanese but run out of their box in English. Proposed, for approval:

| Today (text chip) | Proposed |
|---|---|
| 順番を前へ / 順番を後ろへ | ↑ / ↓ icon buttons (as the municipality list already has) |
| 消す | trash icon (as the municipality list) |
| この次に追加 | + icon ("add the next waypoint here"; stays pressed while choosing on the map) |
| 地図で位置を決める (when 位置なし) | pin icon, with 位置なし as a small red tag |
| スタンプ / 寄り道 / 案内のみ toggles | small read-only icons on the row (seal, branch, (i)); switched in the waypoint panel, which already has the same switches |
| 種類 drop-down | moves into the waypoint panel |
| 同じ場所に終点を追加 | moves into the waypoint panel (used once per course) |
| 公開中 | stays a tag (short in both languages) |

Every icon button keeps a 48 px target, an `aria-label` and a tooltip in both languages, and the visible `:focus-visible` ring.

## A ferry is not walked (user, 2026-11-17)

A course can include a ferry (or a bus). In the map editor a leg is marked as ridden with **選んだ区間 > 移動の手段** (歩く / 船 / バス / 電車 / ほかの乗り物, with minutes). A ridden leg is already left out of the distance and the climb (`walkedStats`), and its minutes are added to the time.

What is still wrong: the **elevation chart** (`buildProfile` in `lib/elevation-profile.ts`) fills every missing height between its neighbours and knows nothing of ridden legs, so a sea crossing is drawn as flat walking and its 登り/下り can differ from the course's numbers. Fix: the chart is cut over each ridden leg (a light band, no height line; reading a point there gives the ride, never "0m"), and its 登り/下り count only the walked parts. The signal is the leg's ride mark, not a missing height: a GPX track or a snapped line can carry heights of about 0 m over the water. A leg that nobody marked as ridden still reads as walked; nothing can tell it apart.

## Data

The overview must not load everything at once (CLAUDE.md: never return all places in one response; the president's scope talks of 500+ places).

- **New `GET /admin/map/overview?bbox=west,south,east,north`**: for the visible area, each course's id, name, state, bounds and a **thinned line** (about 300 points), its waypoints (id, position, kind, stamp switch, name), and the directory places (id, position, category, name, status). Admin and editor roles only (the role check from `routeKit`, as the other admin routes), input validated with TypeBox, at most 3 database queries at once (the pooler hangs above that; see the pool note), and a cap on rows with a "zoom in" answer when the area holds too many. The selector's list (id, number, name) comes from the existing course list.
- **Editing loads the full course** with the existing `GET /admin/routes/:id`, and saves with the existing endpoints. No new write endpoints.
- **Directory places** load and save with the existing `/admin/lists/directory/:id`.
- The overview is read again after a save, so the faint layer shows the new state.

## Built in this order (one PR each)

Done: 1. **`useRouteDraft`** (PR #577).

Next, the fixes the user asked for on the same day (they help the course page now):

- a. **Elevation chart over a ferry** (above).
- b. **Overview tab** of the course editor: the distance, climb and time are read-only while they come from the line (an (i) says they are made automatically; a course with no line, or one whose number was typed, stays typeable); the むずかしさ（ひとこと） box is hidden unless a course already has text in it, so old text can still be cleared; 写真 and 動画 become separate sections, the video plays in a preview there before publishing, and the boxes for 前の動画のリンク and 変更の履歴 look different from each other. Waits for #577 (both edit `RouteEditor.tsx` and the catalogs).
- c. **Course photo centre**: choose where the middle of the course photo is (tap the photo), stored as two numbers 0 to 100 with a database check, used wherever the course photo is cropped (cover, cards, lists). A crop tool was the other option; a centre point is simpler and keeps one stored photo for every shape.
- d. **The course editor's map, made easier** (above): list under the map, icon buttons.

Then the one map:

2. **Overview endpoint** with its authorization tests (a participant gets 403; bbox validation; row cap). Done: #587; a waypoint on two courses lists both (`routeIds`, home first).
3. **`/admin/map`, read only**: every course and place drawn, the course selector (raise and fly to), the list under the map, links to the existing pages.
4. **Edit a course in place** (built): the switch, `MapEditor` with `useRouteDraft` (shared as `CourseMapEditor` and `RestoreOffer`), the save bar, the unsaved check on switching. While editing, the overview map is hidden, so the other courses are not drawn under the editor; a problem that stops a save (all on the course page's overview tab) links there.
5. **Edit a directory place in place**: its form under the map, dragging its marker.
6. **A new course from the map** (decided 7): 新しいコース on the map opens an empty `useRouteDraft` in place; the first save creates it (`POST /admin/routes`, then the usual saves) and the selector switches to it.

## Open questions

1. ~~A new course from the map~~: decided (7), built as step 6.
2. ~~The icon table above~~: approved 2026-11-17, built in #584.
