# One-map editor: every course and place on one admin map

Status: **design, not built** (2026-11-17). Nothing here is code yet; approve or change it, then it is split into the PRs at the end.

## What the user asked (2026-11-17)

> To streamline the places directory, make one single map editor that shows every place, with a switch for "edit this course":
> the map then opens that course's list without switching pages, calling the data and editing it in one place. Keep the
> separate pages for people who have built the muscle memory.

## Decided (user, 2026-11-17)

1. **The map shows every course and the places directory**: each course's line and waypoints, and every お店と施設 place.
2. **"Edit this course" edits everything** the course editor's map can: waypoints and their details, the line and the legs.
3. **The current screens stay** (コース > a course, 場所の一覧 > a place). The new map is an extra way in, not a replacement.

## What exists today, and what we reuse

| Piece | Today | In the one map |
|---|---|---|
| `MapEditor` (1,267 lines) | A **controlled** map: it draws the course draft it is given and reports every edit (`onMovePlace`, `onSetLeg`, ...) | Reused as is for the course being edited |
| `RouteEditor` (901 lines) | Owns one course's draft (`draftReducer`), undo, the unsaved guard, and saving (`planSave`: create/patch/unpublish/delete/order steps, optimistic concurrency) | Its state and save are pulled out into a hook, `useRouteDraft`, so the one map and the course page share them. No behaviour change on the course page |
| `PlacePanel` | The waypoint's form beside the map | Reused for the selected waypoint |
| `AdminItemForm` with `PositionMap` | A directory place's form, on its own page | Opened in the side panel for a selected directory place (`onSaved` / `onRemoved`, as the banners do since #570) |
| `useDiscardCheck` (#570) | Asks before an in-place form drops unsaved changes | Asked before switching course or place |

The extraction of `useRouteDraft` is the one risky step: the course page must behave exactly as before. It goes first, alone, with the existing tests and a click-through.

## The screen

`/admin/map` (menu: コースとラリー > 地図でまとめて編集). Desktop first (`lg:`), like the rest of the admin.

```
┌─────────────────────────────────────────────┬──────────────────────────┐
│ [コース: すべて ▾] [☐ 場所の一覧も表示]        │  (nothing selected)       │
│                                             │  地図の線や点を押すと、    │
│        all course lines, thin, muted        │  ここに出ます。           │
│        waypoints as small dots              │                          │
│        directory places as category icons   │                          │
│                                             │                          │
└─────────────────────────────────────────────┴──────────────────────────┘
```

- **Nothing editable at first.** Tapping a course's line or waypoint selects that course: the panel shows its name, state and **このコースを編集する** (the switch).
- **"Edit this course" on:** that course's draft is loaded (the same data as its course page), the map becomes `MapEditor` for it (its toolbar, legs, drag), the other courses stay faint underneath, and the panel shows its waypoint list and `PlacePanel`. A save bar at the top saves the course (the same steps as the course page). Switching it off, or picking another course, asks first when there are unsaved changes.
- **A directory place:** tapping it opens its form in the panel (position, details, publish). Dragging its marker moves it (the same check rule as today: the position stays unchecked until a person ticks 位置を確認した).
- **Only one thing is edited at a time**: one course or one directory place. That keeps saving, undo and conflicts exactly as they are today.
- A link to the course's own page and the place's own page stays in the panel, for anyone who wants the full form.

Phones: the admin is desktop first; on a narrow screen the page says to use a wider screen, and links to the usual lists.

## Data

The overview must not load everything at once (CLAUDE.md: never return all places in one response; the president's scope talks of 500+ places).

- **New `GET /admin/map/overview?bbox=west,south,east,north`**: for the visible area, each course's id, name, state and a **thinned line** (about 300 points), its waypoints (id, position, kind, stamp switch, name), and the directory places (id, position, category, name, status). Admin and editor roles only (the role check from `routeKit`, as the other admin routes), input validated with TypeBox, at most 3 database queries at once (the pooler hangs above that; see the pool note), and a cap on rows with a "zoom in" answer when the area holds too many.
- **Editing loads the full course** with the existing `GET /admin/routes/:id`, and saves with the existing endpoints. No new write endpoints.
- **Directory places** load and save with the existing `/admin/lists/directory/:id`.
- The overview is read again after a save, so the faint layer shows the new state.

## Built in this order (one PR each)

1. **`useRouteDraft`**: move the course editor's state and save out of `RouteEditor` into a hook; the course page uses it. No visible change. Tests stay green; click-through of a course edit and save.
2. **Overview endpoint** with its authorization tests (a participant gets 403; bbox validation; row cap).
3. **`/admin/map`, read only**: every course and place drawn, selection, the panel with links to the existing pages.
4. **Edit a course in place**: the switch, `MapEditor` with `useRouteDraft`, the save bar, the unsaved check on switching.
5. **Edit a directory place in place**: its form in the panel, dragging its marker.

Each step is usable on its own; after step 3 the map already helps find things, after step 4 the main goal is met.

## Open questions

1. **Menu name:** 地図でまとめて編集, or something shorter (地図)?
2. **Lines of the other courses while editing one:** faint but visible (proposed), or hidden?
3. **Draft and unchecked places:** shown to the admin with the same draft look as the course editor (proposed), or hidden behind a filter?
4. **Creating a new course from the map:** out of scope for now (proposed); new courses keep coming from コース > 新しいコース.
