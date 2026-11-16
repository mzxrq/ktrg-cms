import { describe, expect, test } from "bun:test";
import { journeyFacts, walkTime, type JourneyRoute } from "./rally-journey";

const route = (id: string, over: Partial<JourneyRoute> = {}): JourneyRoute => ({ id, distanceKm: null, expectedTimeMin: null, photoUrl: null, ...over });

describe("journeyFacts", () => {
  test("adds up the courses the rally runs through, and only those", () => {
    const routes = [route("a", { distanceKm: 6.2, expectedTimeMin: 150 }), route("b", { distanceKm: 4.14, expectedTimeMin: 98 }), route("other", { distanceKm: 99, expectedTimeMin: 999 })];
    expect(journeyFacts({ total: 10, routeIds: ["a", "b"] }, routes)).toMatchObject({ places: 10, km: 10.3, minutes: 250 });
  });

  test("a course that does not say adds nothing; none that say gives null", () => {
    expect(journeyFacts({ total: 3, routeIds: ["a", "b"] }, [route("a", { distanceKm: 5 }), route("b")])).toMatchObject({ km: 5, minutes: null });
    expect(journeyFacts({ total: 3, routeIds: ["a"] }, [route("a")])).toMatchObject({ km: null, minutes: null });
  });

  test("takes the photo of the first course, in the rally's order, that has one", () => {
    const routes = [route("a"), route("b", { photoUrl: "/b.jpg", photoCredit: "B" }), route("c", { photoUrl: "/c.jpg" })];
    expect(journeyFacts({ total: 1, routeIds: ["a", "c", "b"] }, routes)).toMatchObject({ photoUrl: "/c.jpg", photoCredit: null });
  });

  test("an unknown course id is ignored", () => {
    expect(journeyFacts({ total: 1, routeIds: ["gone"] }, [route("a", { distanceKm: 1 })]).km).toBeNull();
  });
});

describe("walkTime", () => {
  test("splits minutes into hours and minutes", () => {
    expect(walkTime(150)).toEqual({ hours: 2, minutes: 30 });
    expect(walkTime(45)).toEqual({ hours: 0, minutes: 45 });
    expect(walkTime(120)).toEqual({ hours: 2, minutes: 0 });
  });
});
