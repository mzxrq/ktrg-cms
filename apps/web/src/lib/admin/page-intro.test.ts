import { describe, expect, test } from "bun:test";
import { splitIntro } from "./page-intro";

describe("splitIntro", () => {
  test("Japanese: the first sentence, then the rest", () => {
    expect(splitIntro("登録したアカウントです。権限を変えるには、もう一度本人確認が必要です。自分の権限は変えられません。")).toEqual({ summary: "登録したアカウントです。", more: "権限を変えるには、もう一度本人確認が必要です。自分の権限は変えられません。" });
  });
  test("English: splits at a full stop followed by a space, not inside a number or a closing bracket", () => {
    expect(splitIntro("Tags for blog posts (events, seasons, history ...). Pick them on a post's Details tab.")).toEqual({ summary: "Tags for blog posts (events, seasons, history ...).", more: "Pick them on a post's Details tab." });
    expect(splitIntro("Photos about 1.5 MB each. Use the arrows.")).toEqual({ summary: "Photos about 1.5 MB each.", more: "Use the arrows." });
  });
  test("one sentence only: no (i)", () => {
    expect(splitIntro("Registered accounts.")).toEqual({ summary: "Registered accounts.", more: null });
    expect(splitIntro("歩く順番に並んでいます。")).toEqual({ summary: "歩く順番に並んでいます。", more: null });
    expect(splitIntro("no full stop")).toEqual({ summary: "no full stop", more: null });
  });
});
