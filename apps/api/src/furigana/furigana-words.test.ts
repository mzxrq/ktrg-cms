import { describe, expect, test } from "bun:test";
import { createMemoryAuditWriter } from "../audit/audit-log";
import { createMemoryContentStore } from "../content/content-memory-store";
import { alignReading, BATCH_CHARS, createFuriganaService, createMemoryFuriganaStore, nameReadings, publicFuriganaRoutes, siteTexts, unreadNames } from "./furigana-words";
import { dictionaryWords, type Tokenizer } from "./dictionary";

describe("alignReading", () => {
  test("a whole-word reading goes over the kanji it belongs to", () => {
    expect(alignReading("葛城山", "かつらぎさん")).toBe("葛城山{かつらぎさん}");
    expect(alignReading("取り扱い", "とりあつかい")).toBe("取{と}り扱{あつか}い");
    expect(alignReading("お勧め", "おすすめ")).toBe("お勧{すす}め");
    expect(alignReading("歩く", "アルク")).toBe("歩{ある}く");
  });
  test("kana that do not line up, and words with no kanji, give nothing", () => {
    expect(alignReading("取り扱い", "ぜんぜん")).toBeNull();
    expect(alignReading("やま", "やま")).toBeNull();
  });
});

describe("the furigana list", () => {
  const setup = () => {
    const audit = createMemoryAuditWriter();
    const { store } = createMemoryFuriganaStore(audit.writer);
    return createFuriganaService({ store });
  };
  const admin = "11111111-1111-4111-8111-111111111111";

  test("a plain reading is saved in the marked-up form, and the page gets every word", async () => {
    const s = setup();
    expect((await s.create(admin, { word: "葛城山", reading: "かつらぎさん" })).ok).toBe(true);
    expect((await s.create(admin, { word: "取り扱い", reading: "取{と}り扱{あつか}い" })).ok).toBe(true);
    expect(await s.words()).toEqual({ 葛城山: "葛城山{かつらぎさん}", 取り扱い: "取{と}り扱{あつか}い" });
  });

  test("a word marked always is listed for every visitor; the rest only for those who turned furigana on", async () => {
    const s = setup();
    await s.create(admin, { word: "臥薪嘗胆", reading: "がしんしょうたん", always: true });
    await s.create(admin, { word: "葛城山", reading: "かつらぎさん" });
    expect(await s.always()).toEqual(["臥薪嘗胆"]);
    expect(Object.keys(await s.words()).sort()).toEqual(["臥薪嘗胆", "葛城山"].sort());
  });

  test("a visitor with furigana off is sent only the words marked always", async () => {
    const s = setup();
    await s.create(admin, { word: "臥薪嘗胆", reading: "がしんしょうたん", always: true });
    await s.create(admin, { word: "葛城山", reading: "かつらぎさん" });
    const app = publicFuriganaRoutes(() => s);
    const get = async (q: string) => (await app.handle(new Request(`http://localhost/furigana/words${q}`))).json();
    expect(await get("?only=always")).toEqual({ ok: true, words: { 臥薪嘗胆: "臥薪嘗胆{がしんしょうたん}" }, always: ["臥薪嘗胆"] });
    expect(Object.keys((await get("")).words).sort()).toEqual(["臥薪嘗胆", "葛城山"].sort());
  });

  test("a word may be listed once, must hold a kanji, and its reading must fit it", async () => {
    const s = setup();
    await s.create(admin, { word: "葛城", reading: "かつらぎ" });
    expect(await s.create(admin, { word: "葛城", reading: "かつらぎ" })).toEqual({ ok: false, reason: "conflict" });
    expect(await s.create(admin, { word: "かつらぎ", reading: "かつらぎ" })).toEqual({ ok: false, reason: "validation_failed" });
    expect(await s.create(admin, { word: "取り扱い", reading: "ぜんぜん" })).toEqual({ ok: false, reason: "validation_failed" });
    expect(await s.create(admin, { word: "葛城", reading: "山{やま}" })).toEqual({ ok: false, reason: "conflict" });
    expect(await s.create(admin, { word: "峠", reading: "山{やま}" })).toEqual({ ok: false, reason: "validation_failed" });
  });
});

describe("readings typed with names", () => {
  const admin = "11111111-1111-4111-8111-111111111111";
  const setup = (names: { word: string; reading: string }[]) => {
    const audit = createMemoryAuditWriter();
    const { store } = createMemoryFuriganaStore(audit.writer);
    return createFuriganaService({ store, names: async () => names });
  };

  test("a name's reading joins the list in the marked-up form; one that does not fit its name is left out", async () => {
    const s = setup([
      { word: "葛木神社", reading: "かつらぎじんじゃ" },
      { word: "転法輪寺", reading: "転法輪{てんぽうりん}寺{じ}" },
      { word: "取り扱い", reading: "ぜんぜん" },
    ]);
    expect(await s.words()).toEqual({ 葛木神社: "葛木神社{かつらぎじんじゃ}", 転法輪寺: "転法輪{てんぽうりん}寺{じ}" });
  });

  test("two places written alike but read differently keep their readings to their own pages", async () => {
    const s = setup([
      { word: "高天", reading: "たかま" },
      { word: "高天", reading: "たかあま" },
      { word: "葛城", reading: "かつらぎ" },
      { word: "葛城", reading: "かつらぎ" },
    ]);
    expect(await s.words()).toEqual({ 葛城: "葛城{かつらぎ}" });
  });

  test("a word in the list wins over a name's reading", async () => {
    const s = setup([{ word: "葛城", reading: "かづらき" }]);
    await s.create(admin, { word: "葛城", reading: "かつらぎ" });
    expect(await s.words()).toEqual({ 葛城: "葛城{かつらぎ}" });
  });
});

describe("which names give readings", () => {
  test("course names and published waypoints only: a draft waypoint's name never reaches visitors", async () => {
    const audit = createMemoryAuditWriter();
    const { store: content } = createMemoryContentStore(audit.writer);
    const actor = "11111111-1111-4111-8111-111111111111";
    const route = await content.createRoute(actor, { nameJa: "葛城の道", nameKana: "かつらぎのみち" });
    const draft = await content.createSpot(actor, route.id, { nameJa: "高天寺", nameKana: "たかまでら" });
    const open = await content.createSpot(actor, route.id, { nameJa: "転法輪寺", nameKana: "てんぽうりんじ" });
    await content.setPublished(actor, open!.id, true);
    const places = { listPublic: async () => [{ nameJa: "茶屋", nameKana: "ちゃや" }] };
    const words = (await nameReadings(content, places)).map((n) => n.word);
    expect(words.sort()).toEqual(["葛城の道", "茶屋", "転法輪寺"].sort());
    expect(words).not.toContain(draft!.nameJa);
  });
});

describe("dictionary suggestions", () => {
  const admin = "11111111-1111-4111-8111-111111111111";
  // Each text is one word with its reading, as a pretend dictionary.
  const READINGS: Record<string, string> = { 渓谷: "ケイコク", 鎖場: "クサリバ", 祠: "ホコラ" };
  const tokenizer: Tokenizer = { tokenize: (text) => [{ surface_form: text, reading: READINGS[text] }] };
  const setup = (texts: string[], names: { word: string; reading: string }[] = []) => {
    const audit = createMemoryAuditWriter();
    const { store } = createMemoryFuriganaStore(audit.writer);
    const site = { texts };
    const s = createFuriganaService({ store, names: async () => names, texts: async () => site.texts, tokenizer: async () => tokenizer });
    return { s, site, audit };
  };

  test("suggestions wait: visitors never get them until a person approves", async () => {
    const { s } = setup(["渓谷", "鎖場"]);
    expect(await s.refresh(null)).toEqual({ added: 2, removed: 0 });
    expect(await s.words()).toEqual({});
    const pending = await s.pending();
    expect(pending.map((p) => p.word).sort()).toEqual(["渓谷", "鎖場"]);
    expect(await s.approve(admin, [pending.find((p) => p.word === "渓谷")!.id])).toBe(1);
    expect(await s.words()).toEqual({ 渓谷: "渓谷{けいこく}" });
    expect((await s.pending()).map((p) => p.word)).toEqual(["鎖場"]);
  });

  test("a suggestion corrected in the form becomes a person's word", async () => {
    const { s } = setup(["祠"]);
    await s.refresh(null);
    const [row] = await s.pending();
    const r = await s.update(admin, row!.id, row!.updatedAt, { word: "祠", reading: "ほこら" });
    expect(r.ok).toBe(true);
    expect(await s.words()).toEqual({ 祠: "祠{ほこら}" });
    expect(await s.pending()).toEqual([]);
  });

  test("reading again drops suggestions for words that are gone, and never touches a person's word or a typed name", async () => {
    const { s, site } = setup(["渓谷", "鎖場", "祠"], [{ word: "祠", reading: "ほこら" }]);
    await s.create(admin, { word: "鎖場", reading: "くさりば" });
    expect(await s.refresh(null)).toEqual({ added: 1, removed: 0 });
    site.texts = ["鎖場"];
    expect(await s.refresh(null)).toEqual({ added: 0, removed: 1 });
    expect(await s.pending()).toEqual([]);
    expect(await s.words()).toEqual({ 祠: "祠{ほこら}", 鎖場: "鎖場{くさりば}" });
  });

  test("batches: a text longer than a batch is a batch of its own, and every batch together finds what one pass does", async () => {
    const long = "祠".repeat(BATCH_CHARS + 5);
    const texts = ["渓谷", long, "鎖場", "渓谷"];
    const { s } = setup(texts);
    const batches: { words: { word: string }[]; next: number | null }[] = [];
    for (let from: number | null = 0; from !== null; ) {
      const b = await s.readBatch(from);
      expect(b.next === null || b.next > from).toBe(true); // always moves on
      batches.push(b);
      from = b.next;
    }
    expect(batches.length).toBeGreaterThan(1);
    const gathered = batches.flatMap((b) => b.words.map((w) => w.word)).sort();
    const onePass = [...dictionaryWords(tokenizer, texts, () => false).keys()].sort();
    expect(gathered).toEqual(onePass);
  });

  test("apply checks every pair again: a known word, a bad reading, a plain-kana word or a repeat is left out", async () => {
    const { s } = setup([], [{ word: "祠", reading: "ほこら" }]);
    const r = await s.applySuggestions(null, [
      { word: "渓谷", reading: "渓谷{けいこく}" },
      { word: "渓谷", reading: "渓谷{べつ}" },
      { word: "祠", reading: "祠{ほこら}" },
      { word: "鎖場", reading: "別{くさりば}" },
      { word: "かな", reading: "かな" },
    ]);
    expect(r).toEqual({ added: 1, removed: 0 });
    expect((await s.pending()).map((p) => [p.word, p.reading])).toEqual([["渓谷", "渓谷{けいこく}"]]);
  });

  test("every pair a batch returns passes apply's check", async () => {
    const { s } = setup(["渓谷", "鎖場", "祠"]);
    const { words } = await s.readBatch(0);
    expect(words.length).toBe(3);
    expect(await s.applySuggestions(null, words)).toEqual({ added: 3, removed: 0 });
  });

  test("the admin table lists only a person's words", async () => {
    const { s } = setup(["渓谷"]);
    await s.refresh(null);
    await s.create(admin, { word: "鎖場", reading: "くさりば" });
    const page = await s.list(undefined);
    expect(page.items.map((r) => r.word)).toEqual(["鎖場"]);
  });
});

describe("what the dictionary reads, and which names need a reading", () => {
  test("a 準備中 course gives only its name; drafts are never read", async () => {
    const texts = await siteTexts({
      routes: async () => [
        { nameJa: "葛城の道", descriptionJa: "渓谷を歩く道", publishedSpotCount: 1 },
        { nameJa: "準備中の道", descriptionJa: "まだ秘密の説明", publishedSpotCount: 0 },
      ],
      spots: async () => [{ nameJa: "転法輪寺", descriptionJa: "一行目\n二行目", nameEn: "Tenporinji" }],
      places: async () => [],
      posts: async () => [{ titleJa: "お知らせ", bodyJa: "本文" }],
      notices: async () => [],
    });
    expect(texts).toContain("渓谷を歩く道");
    expect(texts).toContain("準備中の道");
    expect(texts).not.toContain("まだ秘密の説明");
    expect(texts).toContain("二行目");
    expect(texts).not.toContain("Tenporinji");
  });

  test("names with a hard kanji and no reading are listed; typed ones and easy ones are not", async () => {
    const unread = await unreadNames(
      {
        listRoutes: async () => [{ id: "r1", nameJa: "葛城の道", nameKana: null }, { id: "r2", nameJa: "山の道", nameKana: null }],
        listPublishedSpots: async () => [{ id: "s1", routeId: "r1", nameJa: "転法輪寺", nameKana: "てんぽうりんじ" }, { id: "s2", routeId: "r1", nameJa: "鴨山口神社", nameKana: null }],
      },
      { listPublic: async () => [{ id: "p1", nameJa: "茶屋", nameKana: null }] },
    );
    expect(unread).toEqual([
      { kind: "route", id: "r1", nameJa: "葛城の道" },
      { kind: "spot", id: "s2", routeId: "r1", nameJa: "鴨山口神社" },
    ]);
  });
});
