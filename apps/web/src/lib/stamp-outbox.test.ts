import { describe, expect, test } from "bun:test";
import { canQueue, createOutbox } from "./stamp-outbox";
import { createMemoryQueueStore } from "./stamp-queue";
import type { StampResult } from "./stamp-flow";

const reading = { lat: 34.5, lng: 135, accuracyM: 10 };
const make = (answers: StampResult[], over: { ran?: boolean } = {}) => {
  const store = createMemoryQueueStore();
  const sent: { key: string; spotId: string; scannedAt: string }[] = [];
  const outbox = createOutbox({
    store,
    send: async (key, row) => {
      sent.push({ key, spotId: row.spotId, scannedAt: row.scannedAt });
      return answers.shift() ?? { ok: true, already: false };
    },
    now: () => new Date("2026-11-04T10:00:00Z"),
    lock: async (fn) => (over.ran === false ? { ran: false } : { ran: true, value: await fn() }),
  });
  return { outbox, store, sent };
};

describe("the outbox", () => {
  test("a queued stamp is counted, then sent with the time of the press and removed once accepted", async () => {
    const { outbox, store, sent } = make([{ ok: true, already: false }]);
    await outbox.setUser("u1");
    expect(await outbox.enqueue("spot-a", reading)).toBe(true);
    expect(outbox.pending).toBe(1);
    const { ran, result } = await outbox.flush();
    expect(ran).toBe(true);
    expect(result!.outcomes.map((o) => o.kind)).toEqual(["accepted"]);
    expect(sent).toEqual([{ key: "u1", spotId: "spot-a", scannedAt: "2026-11-04T10:00:00.000Z" }]);
    expect(outbox.pending).toBe(0);
    expect(store.rows).toHaveLength(0); // the coordinates are gone with it
  });

  test("a stamp stays while there is no signal, and a definite no removes it with its reason", async () => {
    const { outbox } = make([{ ok: false, failure: "network" }, { ok: false, failure: "too_far" }]);
    await outbox.setUser("guest");
    await outbox.enqueue("spot-a", reading);
    expect((await outbox.flush()).result!.waiting).toBe(true);
    expect(outbox.pending).toBe(1);
    const second = await outbox.flush();
    expect(second.result!.outcomes[0]).toMatchObject({ kind: "rejected", failure: "too_far" });
    expect(outbox.pending).toBe(0);
  });

  test("only the current account's stamps are counted and sent", async () => {
    const { outbox, sent } = make([]);
    await outbox.setUser("u1");
    await outbox.enqueue("spot-a", reading);
    await outbox.setUser("u2");
    expect(outbox.pending).toBe(0);
    await outbox.flush();
    expect(sent).toHaveLength(0);
    await outbox.setUser("u1");
    expect(outbox.pending).toBe(1);
  });

  test("another tab uploading: this one does nothing; a store that cannot write says so", async () => {
    const { outbox } = make([], { ran: false });
    await outbox.enqueue("spot-a", reading);
    expect((await outbox.flush()).ran).toBe(false);
    const broken = createOutbox({
      store: { add: async () => { throw new Error("full"); }, list: async () => [], all: async () => [], remove: async () => {}, update: async () => {} },
      send: async () => ({ ok: true, already: false }),
      now: () => new Date(),
      lock: async (fn) => ({ ran: true, value: await fn() }),
    });
    expect(await broken.enqueue("spot-a", reading)).toBe(false);
  });

  test("stamps pressed as a guest move to the account on sign-in and are sent as its own; or are dropped on request", async () => {
    const { outbox, store, sent } = make([]);
    await outbox.setUser("guest");
    await outbox.enqueue("spot-a", reading);
    await outbox.enqueue("spot-b", reading);
    await outbox.setUser("u1");
    expect(outbox.pending).toBe(0); // still theirs, not the account's
    expect(await outbox.guestWaiting()).toBe(2);
    expect(await outbox.adoptGuest()).toBe(2);
    expect(outbox.pending).toBe(2);
    await outbox.flush();
    expect(sent.map((s) => s.key)).toEqual(["u1", "u1"]);
    expect(store.rows).toHaveLength(0);

    await outbox.setUser("guest");
    await outbox.enqueue("spot-c", reading);
    await outbox.setUser("u1");
    await outbox.discardGuest();
    expect(await outbox.guestWaiting()).toBe(0);
    expect(store.rows).toHaveLength(0);
  });

  test("adopting while still a guest does nothing", async () => {
    const { outbox } = make([]);
    await outbox.setUser("guest");
    await outbox.enqueue("spot-a", reading);
    expect(await outbox.adoptGuest()).toBe(0);
    expect(outbox.pending).toBe(1);
  });
  test("a place already waiting is not queued twice, and the screens can ask which places wait", async () => {
    const { outbox, store } = make([]);
    await outbox.setUser("u1");
    expect(await outbox.enqueue("spot-a", reading)).toBe(true);
    expect(await outbox.enqueue("spot-a", reading)).toBe(true);
    expect(outbox.pending).toBe(1);
    expect((await store.list("u1")).length).toBe(1);
    expect(await outbox.waitingSpots()).toEqual(["spot-a"]);
  });

  test("a waiting stamp the server would refuse for a rough reading is replaced by a better press", async () => {
    const { outbox, store } = make([]);
    await outbox.setUser("u1");
    // An older version queued a 250 m reading; the walker presses again in the open.
    await store.add({ id: "old", userKey: "u1", spotId: "spot-a", lat: 34.5, lng: 135, accuracyM: 250, scannedAt: "2026-11-04T09:00:00.000Z", tries: 0 });
    expect(await outbox.enqueue("spot-a", reading)).toBe(true);
    expect((await store.list("u1")).map((r) => r.accuracyM)).toEqual([10]);
  });

  test("on page load, waiting stamps of any account older than 48 h leave the phone (they hold coordinates)", async () => {
    const { outbox, store } = make([]);
    const row = (id: string, userKey: string, scannedAt: string) => ({ id, userKey, spotId: id, lat: 34.5, lng: 135, accuracyM: 10, scannedAt, tries: 0 });
    await store.add(row("old-other", "someone-signed-out", "2026-11-01T09:00:00.000Z"));
    await store.add(row("new-other", "someone-signed-out", "2026-11-04T09:00:00.000Z"));
    await store.add(row("old-mine", "u1", "2026-11-02T09:00:00.000Z"));
    await outbox.setUser("u1");
    expect(store.rows.map((r) => r.id).sort()).toEqual(["new-other"]);
  });
});

describe("what may wait on the phone", () => {
  test("only a reading the server would accept (100 m or better) is queued", () => {
    expect(canQueue({ lat: 34.5, lng: 135, accuracyM: 100 })).toBe(true);
    expect(canQueue({ lat: 34.5, lng: 135, accuracyM: 101 })).toBe(false);
  });
});
