import { describe, expect, test } from "bun:test";
import { stampStatusSource } from "./stamp-point";

const from = { id: "w", status: "open" as const };

describe("stampStatusSource: the spot whose status decides the stamp", () => {
  test("a closed place with an open 閉鎖時のスタンプ地点 follows the waypoint (id and status)", () => {
    expect(stampStatusSource({ id: "x", status: "closed", stampFrom: from })).toEqual({ spotId: "w", status: "open" });
  });
  test("a 遥拝 place always follows its waypoint, also a closed one", () => {
    expect(stampStatusSource({ id: "x", status: "open", detached: true, stampFrom: { id: "w", status: "closed" } })).toEqual({ spotId: "w", status: "closed" });
  });
  test("an open on-trail place with a fallback point uses its own status", () => {
    expect(stampStatusSource({ id: "x", status: "open", stampFrom: from })).toEqual({ spotId: "x", status: "open" });
  });
  test("an info place never follows a waypoint", () => {
    expect(stampStatusSource({ id: "x", status: "info", detached: true, stampFrom: from })).toEqual({ spotId: "x", status: "info" });
  });
  test("no waypoint status known: its own", () => {
    expect(stampStatusSource({ id: "x", status: "closed", stampFrom: { id: "w" } })).toEqual({ spotId: "x", status: "closed" });
  });
});
