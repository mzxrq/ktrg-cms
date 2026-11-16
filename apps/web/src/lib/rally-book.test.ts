import { describe, expect, test } from "bun:test";
import { bookPages, nearestToilet, type BookInput, type ToiletPlace } from "./rally-book";

const toilet = (id: string, lat: number, lng: number, category = "toilet"): ToiletPlace => ({ id, category, nameJa: id, nameEn: null, hoursJa: null, hoursEn: null, lat, lng });
const here = { lat: 34.5, lng: 135.7 };

describe("nearestToilet", () => {
  test("the nearest toilet within reach, with the straight-line metres", () => {
    const got = nearestToilet(here, [toilet("far", 34.51, 135.7), toilet("near", 34.5009, 135.7)]);
    expect(got?.place.id).toBe("near");
    expect(Math.round(got?.meters ?? 0)).toBe(100);
  });

  test("ignores places that are not toilets, and toilets too far to be useful", () => {
    expect(nearestToilet(here, [toilet("shop", 34.5001, 135.7, "souvenir_shop")])).toBeNull();
    expect(nearestToilet(here, [toilet("far", 34.6, 135.7)])).toBeNull(); // about 11 km
  });

  test("a place without a checked position has no nearest toilet", () => {
    expect(nearestToilet(null, [toilet("a", 34.5, 135.7)])).toBeNull();
  });
});

const input = (over: Partial<BookInput> = {}): BookInput => ({
  places: [
    { id: "a", status: "open", nameJa: "A", nameEn: null, photoUrl: null, descriptionJa: null, descriptionEn: null, nameKana: null, historyJa: null, historyEn: null, statusNoteJa: null, statusNoteEn: null, routeId: "r", lat: 34.5, lng: 135.7 },
    { id: "i", status: "info", nameJa: "I", nameEn: null, photoUrl: null, descriptionJa: null, descriptionEn: null, nameKana: null, historyJa: null, historyEn: null, statusNoteJa: null, statusNoteEn: null, routeId: "r", lat: 34.502, lng: 135.7 },
    { id: "b", status: "open", nameJa: "B", nameEn: null, photoUrl: null, descriptionJa: null, descriptionEn: null, nameKana: null, historyJa: null, historyEn: null, statusNoteJa: null, statusNoteEn: null, routeId: "r2", lat: 34.51, lng: 135.7 },
  ],
  held: new Set(["a"]),
  stampedAt: new Map([["a", "2026-11-15T01:00:00Z"]]),
  routes: [{ routeId: "r", accessJa: "駅からバス", accessEn: null }],
  toilets: [toilet("t", 34.5005, 135.7)],
  ...over,
});

describe("bookPages", () => {
  test("one page per place, in order, with the state, the date stamped and the course's access text", () => {
    const pages = bookPages(input());
    expect(pages.map((p) => [p.id, p.state])).toEqual([["a", "stamped"], ["i", "info"], ["b", "next"]]);
    expect(pages[0]).toMatchObject({ stampedAt: "2026-11-15T01:00:00Z", accessJa: "駅からバス", number: 1 });
    expect(pages[2]).toMatchObject({ stampedAt: null, accessJa: null }); // its course says nothing
  });

  test("the distance to the next place skips a place that offers no stamp; the last place has none", () => {
    const pages = bookPages(input());
    expect(pages[0]?.next?.nameJa).toBe("B");
    expect(Math.round(pages[0]?.next?.meters ?? 0)).toBe(1112);
    expect(pages[2]?.next).toBeNull();
  });

  test("a place without a checked position has no distance and no toilet", () => {
    const places = input().places.map((p) => (p.id === "a" ? { ...p, lat: null, lng: null } : p));
    const pages = bookPages(input({ places }));
    expect(pages[0]?.next).toBeNull();
    expect(pages[0]?.toilet).toBeNull();
  });

  test("the nearest toilet is attached to the page", () => {
    expect(bookPages(input())[0]?.toilet).toMatchObject({ nameJa: "t" });
  });
});
