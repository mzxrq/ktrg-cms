import { describe, expect, test } from "bun:test";
import { backupKey, firstRead, parseBackup, restoreOnto, worthRestoring, writeBackup } from "./draft-backup";
import { emptyDraft, newPlace } from "./route-draft";

const memory = () => {
  const m = new Map<string, string>();
  return { m, store: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } };
};
const saved = { ...emptyDraft(), id: "r1", updatedAt: "2026-10-21T00:00:00.000Z", nameJa: "葛城の道" };

describe("the unsaved-work backup", () => {
  test("a copy is kept while there are unsaved changes and dropped once everything is saved", () => {
    const { m, store } = memory();
    const edited = { ...saved, nameJa: "変えた" };
    writeBackup(store, edited, saved.updatedAt, true);
    const kept = parseBackup(m.get(backupKey("r1")) ?? null);
    expect(kept?.draft.nameJa).toBe("変えた");
    expect(worthRestoring(kept, saved)).toBe(true);
    writeBackup(store, saved, saved.updatedAt, false);
    expect(m.size).toBe(0);
  });

  test("after a save conflict the copy is offered although the route moved on; restoring keeps the other person's changes", () => {
    const { store, m } = memory();
    const a = { ...newPlace("a", 34, 135, 1), id: "a", updatedAt: "2026-10-21T00:00:00.000Z" };
    const b = { ...newPlace("b", 34.1, 135.1, 2), id: "b", updatedAt: "2026-10-21T00:00:00.000Z" };
    const start = { ...saved, places: [a, b] };
    // Mine: the English name, and waypoint a's name.
    const mine = { ...start, nameEn: "Mine", places: [{ ...a, nameJa: "わたしの経由地" }, b] };
    writeBackup(store, mine, saved.updatedAt, true, new Date(), start);
    // Theirs, saved first: the description, waypoint a's note and publishing it, a new waypoint c; newer times everywhere.
    const c = { ...newPlace("c", 34.2, 135.2, 3), id: "c", updatedAt: "2026-10-22T00:00:00.000Z" };
    const theirs = {
      ...start,
      updatedAt: "2026-10-22T00:00:00.000Z",
      descriptionJa: "ほかの人の説明",
      places: [{ ...a, statusNoteJa: "ほかの人の注意", published: true, updatedAt: "2026-10-22T01:00:00.000Z" }, { ...b, updatedAt: "2026-10-22T02:00:00.000Z" }, c],
    };
    const kept = parseBackup(m.get(backupKey("r1")) ?? null);
    expect(worthRestoring(kept, theirs)).toBe(true);
    const back = restoreOnto(kept!, theirs);
    expect(back).toMatchObject({ nameEn: "Mine", descriptionJa: "ほかの人の説明", updatedAt: "2026-10-22T00:00:00.000Z" });
    expect(back.places.map((p) => [p.key, p.nameJa, p.statusNoteJa, p.updatedAt, p.published])).toEqual([
      ["a", "わたしの経由地", "ほかの人の注意", "2026-10-22T01:00:00.000Z", true],
      ["b", b.nameJa, b.statusNoteJa, "2026-10-22T02:00:00.000Z", false],
      ["c", c.nameJa, c.statusNoteJa, "2026-10-22T00:00:00.000Z", false],
    ]);
  });

  test("a copy without a conflict comes back exactly as it was kept", () => {
    const { store, m } = memory();
    const mine = { ...saved, nameJa: "変えた" };
    writeBackup(store, mine, saved.updatedAt, true);
    expect(restoreOnto(parseBackup(m.get(backupKey("r1")) ?? null)!, saved)).toEqual(mine);
  });

  test("a copy of another version, an identical one, or junk is not offered", () => {
    const { store, m } = memory();
    writeBackup(store, { ...saved, nameJa: "x" }, "2026-01-01T00:00:00.000Z", true);
    expect(worthRestoring(parseBackup(m.get(backupKey("r1")) ?? null), saved)).toBe(false); // the route moved on since
    writeBackup(store, saved, saved.updatedAt, true);
    expect(worthRestoring(parseBackup(m.get(backupKey("r1")) ?? null), saved)).toBe(false); // nothing differs
    expect(parseBackup("{not json")).toBeNull();
    expect(parseBackup('{"at":"x","base":null,"draft":{}}')).toBeNull();
    expect(parseBackup(null)).toBeNull();
  });

  test("full or blocked storage does not break editing", () => {
    const broken = { getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(() => writeBackup(broken, saved, saved.updatedAt, true)).not.toThrow();
    expect(() => writeBackup(broken, saved, saved.updatedAt, false)).not.toThrow();
  });
});

describe("firstRead", () => {
  test("keeps what was stored when the editor opened, even after this visit writes a new copy", () => {
    const m = new Map<string, string>([["k", "old"]]);
    const read = firstRead(() => m.get("k") ?? null);
    expect(read()).toBe("old");
    m.set("k", "written this visit");
    expect(read()).toBe("old");
  });
  test("nothing stored, or storage blocked: null, and it stays null", () => {
    const m = new Map<string, string>();
    const read = firstRead(() => m.get("k") ?? null);
    expect(read()).toBeNull();
    m.set("k", "later");
    expect(read()).toBeNull();
    const blocked = firstRead(() => {
      throw new Error("blocked");
    });
    expect(blocked()).toBeNull();
  });
});
