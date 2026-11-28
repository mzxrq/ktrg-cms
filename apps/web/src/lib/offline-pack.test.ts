import { afterEach, beforeEach, expect, test } from "bun:test";
import { claimSavedPages, deletePack, megabytes, packAge, packTileUrls, readPack, refreshSavedPages, savePack } from "./offline-pack";
import { largeStyleUrl } from "./large-map-style";
import { defaultMapSettings } from "./map-settings";

const area = { lat: 34.45, lng: 135.65, widthM: 4000, heightM: 4000, verified: true };

// A Cache Storage in memory: just enough of caches / Cache for the pack.
function fakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    const s = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, s);
    return { put: async (u: string, r: Response) => void s.set(u, r), match: async (u: string) => s.get(u)?.clone(), delete: async (u: string) => s.delete(u), keys: async () => [...s.keys()] };
  };
  return { stores, caches: { open, keys: async () => [...stores.keys()], has: async (n: string) => stores.has(n), delete: async (n: string) => stores.delete(n) } };
}

const realFetch = globalThis.fetch;
let fake: ReturnType<typeof fakeCaches>;
beforeEach(() => {
  fake = fakeCaches();
  (globalThis as { caches?: unknown }).caches = fake.caches;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete (globalThis as { caches?: unknown }).caches;
});

test("the tile list holds the base map and the overlay, each within its own zoom range", () => {
  const urls = packTileUrls(area, { base: "pale", terrain: "relief" });
  expect(urls.some((u) => u.includes("/pale/11/"))).toBe(true);
  expect(urls.some((u) => u.includes("/relief/15/"))).toBe(true);
  expect(packTileUrls(area, { base: "blank", terrain: "hillshade" }).some((u) => u.includes("/blank/15/"))).toBe(false);
  expect(packTileUrls(area, { base: "photo", terrain: "hillshade" }).some((u) => u.includes("/seamlessphoto/") && u.endsWith(".jpg"))).toBe(true);
});

test("the 大きい文字 base also keeps its style and icons, or offline the map has nothing to draw with", () => {
  const urls = packTileUrls(area, { base: "large", terrain: "hillshade" });
  expect(urls).toContain(largeStyleUrl({ ...defaultMapSettings, terrain: "hillshade" }));
  expect(urls).toContain("/map-style/sprite/std@2x.png");
  expect(packTileUrls(area, { base: "pale", terrain: "hillshade" }).some((u) => u.startsWith("/map-style/"))).toBe(false);
});

// Pages answer with a body, tiles with bytes; the course answers with a line.
const site = (u: string) =>
  u === "/api/v1/routes/r1" ? new Response(JSON.stringify({ route: { line: { coordinates: [[1, 2]] }, spots: ["private"] } })) : new Response("x".repeat(1000));

test("the pages and the line are kept with the pack, the line without the rest of the course", async () => {
  globalThis.fetch = (async (u: string) => site(u)) as unknown as typeof fetch;
  await savePack("r1", ["u/1"], () => {});
  expect([...(fake.stores.get("ktrg-pages")?.keys() ?? [])].sort()).toEqual(["/map", "/routes/r1"]);
  const line = await fake.stores.get("ktrg-pack-r1")?.get("/api/v1/routes/r1")?.json();
  expect(line).toEqual({ route: { line: { coordinates: [[1, 2]] } } });
});

test("deleting the last pack takes the map page too", async () => {
  globalThis.fetch = (async (u: string) => site(u)) as unknown as typeof fetch;
  await savePack("r1", ["u/1"], () => {});
  await savePack("r2", ["u/1"], () => {});
  await deletePack("r1");
  expect([...(fake.stores.get("ktrg-pages")?.keys() ?? [])].sort()).toEqual(["/map", "/routes/r2"]);
  await deletePack("r2");
  expect([...(fake.stores.get("ktrg-pages")?.keys() ?? [])]).toEqual([]);
});

test("after a new version takes over, every saved page is fetched again; one that fails keeps its old copy", async () => {
  globalThis.fetch = (async (u: string) => site(u)) as unknown as typeof fetch;
  await savePack("r1", ["u/1"], () => {});
  const asked: string[] = [];
  globalThis.fetch = (async (u: string, init?: RequestInit) => {
    asked.push(`${u} ${init?.cache}`);
    return u === "/map" ? new Response("new map page") : new Response("", { status: 503 });
  }) as unknown as typeof fetch;
  await refreshSavedPages();
  expect(asked.sort()).toEqual(["/map reload", "/routes/r1 reload"]);
  expect(await fake.stores.get("ktrg-pages")?.get("/map")?.text()).toBe("new map page");
  expect(await fake.stores.get("ktrg-pages")?.get("/routes/r1")?.text()).toBe("x".repeat(1000));
});

test("a course whose course page is missing (tiles still on the phone) is not shown as saved", async () => {
  globalThis.fetch = (async (u: string) => site(u)) as unknown as typeof fetch;
  await savePack("r1", ["u/1"], () => {}, 5000);
  expect(await readPack("r1")).not.toBeNull();
  fake.stores.get("ktrg-pages")!.delete("/routes/r1");
  expect(await readPack("r1")).toBeNull();
});

test("another person here (signed in, or signed out): the saved pages stay and are fetched again for them", async () => {
  globalThis.fetch = (async (u: string) => site(u)) as unknown as typeof fetch;
  await claimSavedPages("user-a");
  await savePack("r1", ["u/1"], () => {});
  const asked: string[] = [];
  globalThis.fetch = (async (u: string) => (asked.push(u), new Response(`page for b: ${u}`))) as unknown as typeof fetch;
  await claimSavedPages("user-a"); // the same person: nothing fetched
  expect(asked).toEqual([]);
  await claimSavedPages("user-b"); // A signed out or their session ended; B is here now
  expect(asked.sort()).toEqual(["/map", "/routes/r1"]);
  expect(await readPack("r1")).not.toBeNull(); // still 保存済み, still opens offline
  expect(await fake.stores.get("ktrg-pages")?.get("/routes/r1")?.text()).toBe("page for b: /routes/r1");
});

test("with no signal for the new person, the pages stay as they were and are fetched again on a later load", async () => {
  globalThis.fetch = (async (u: string) => site(u)) as unknown as typeof fetch;
  await claimSavedPages("user-a");
  await savePack("r1", ["u/1"], () => {});
  globalThis.fetch = (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch;
  await claimSavedPages("guest");
  expect(await readPack("r1")).not.toBeNull();
  const asked: string[] = [];
  globalThis.fetch = (async (u: string) => (asked.push(u), new Response("ok"))) as unknown as typeof fetch;
  await claimSavedPages("guest"); // not marked as the guest's yet: tried again
  expect(asked.sort()).toEqual(["/map", "/routes/r1"]);
});

test("a page that cannot be fetched fails the whole pack", async () => {
  globalThis.fetch = (async (u: string) => (u === "/map" ? new Response("", { status: 500 }) : site(u))) as unknown as typeof fetch;
  await expect(savePack("r1", ["u/1"], () => {})).rejects.toThrow();
  expect(fake.stores.has("ktrg-pack-r1")).toBe(false);
});

test("a saved pack is described, and deleting it removes everything", async () => {
  globalThis.fetch = (async () => new Response("x".repeat(1000))) as unknown as typeof fetch;
  const seen: number[] = [];
  const info = await savePack("r1", ["u/1", "u/2", "u/3", "u/4"], (d) => seen.push(d), 5000);
  expect(info).toEqual({ savedAt: 5000, bytes: 4000, tiles: 4 });
  expect(seen.length).toBe(4);
  expect(await readPack("r1")).toEqual(info);
  expect(await readPack("r2")).toBeNull();
  await deletePack("r1");
  expect(await readPack("r1")).toBeNull();
});

test("a download where most tiles failed is not kept as saved", async () => {
  globalThis.fetch = (async (u: string) => (u.endsWith("1") ? new Response("x") : new Response("", { status: 404 }))) as unknown as typeof fetch;
  await expect(savePack("r1", ["u/1", "u/2", "u/3", "u/4"], () => {})).rejects.toThrow();
  expect(fake.stores.has("ktrg-pack-r1")).toBe(false);
});

test("an update that fails keeps the pack already saved", async () => {
  globalThis.fetch = (async (u: string) => site(u)) as unknown as typeof fetch;
  const saved = await savePack("r1", ["u/1", "u/2"], () => {}, 5000);

  // The signal goes while the pages are fetched.
  globalThis.fetch = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
  await expect(savePack("r1", ["u/1", "u/2"], () => {}, 9000)).rejects.toThrow();
  expect(await readPack("r1")).toEqual(saved);

  // The pages arrive, and then most of the tiles do not.
  globalThis.fetch = (async (u: string) => (u.startsWith("u/") ? new Response("", { status: 500 }) : site(u))) as unknown as typeof fetch;
  await expect(savePack("r1", ["u/1", "u/2"], () => {}, 9000)).rejects.toThrow();
  expect(await readPack("r1")).toEqual(saved);
  expect(await fake.stores.get("ktrg-pack-r1")?.get("u/1")?.text()).toBe("x".repeat(1000));
});

test("tiles are asked for past the worker's saved copy, so an update really fetches them", async () => {
  const asked: (RequestInit | undefined)[] = [];
  globalThis.fetch = (async (u: string, init?: RequestInit) => {
    if (u === "u/1") asked.push(init);
    return site(u);
  }) as unknown as typeof fetch;
  await savePack("r1", ["u/1"], () => {});
  expect(asked.map((i) => i?.cache)).toEqual(["reload"]);
  // and with a time limit, so a stalled tile counts as missing instead of freezing the progress
  expect(asked[0]?.signal).toBeInstanceOf(AbortSignal);
});

test("age and size read plainly", () => {
  const now = 10 * 24 * 3600_000;
  expect(packAge(now - 30_000, now)).toEqual({ n: 0, unit: "minute" });
  expect(packAge(now - 5 * 3600_000, now)).toEqual({ n: 5, unit: "hour" });
  expect(packAge(now - 3 * 24 * 3600_000, now)).toEqual({ n: 3, unit: "day" });
  expect(megabytes(800_000)).toBe("0.8");
  expect(megabytes(100)).toBe("0.1");
  expect(megabytes(12_400_000)).toBe("12");
});

test("an update drops the tiles the new pack no longer uses, and keeps the course line", async () => {
  globalThis.fetch = (async (u: string) => site(u)) as unknown as typeof fetch;
  await savePack("r1", ["u/1", "u/2"], () => {});
  await savePack("r1", ["u/2", "u/3"], () => {});
  const kept = [...(fake.stores.get("ktrg-pack-r1")?.keys() ?? [])];
  expect(kept).not.toContain("u/1");
  expect(kept).toEqual(expect.arrayContaining(["u/2", "u/3", "/__pack-meta", "/api/v1/routes/r1"]));
});
