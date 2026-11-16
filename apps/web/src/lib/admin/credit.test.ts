import { expect, test } from "bun:test";
import { joinCredit, splitCredit } from "./credit";

test("a linked credit opens as its words and its link, and goes back the same", () => {
  const stored = "[KENPEI, CC BY-SA 3.0](https://commons.wikimedia.org/wiki/File:Kada-kasuga-jinja.jpg)";
  const { text, link } = splitCredit(stored);
  expect(text).toBe("KENPEI, CC BY-SA 3.0");
  expect(link).toBe("https://commons.wikimedia.org/wiki/File:Kada-kasuga-jinja.jpg");
  expect(joinCredit(text, link)).toBe(stored);
});

test("plain words stay plain; a link with no words shows the link; brackets cannot break the link", () => {
  expect(splitCredit("山田太郎, CC BY-SA 4.0")).toEqual({ text: "山田太郎, CC BY-SA 4.0", link: "" });
  expect(joinCredit("山田太郎", "")).toBe("山田太郎");
  expect(joinCredit("", "https://example.com/p")).toBe("[https://example.com/p](https://example.com/p)");
  expect(joinCredit("a [b]", "https://x.jp")).toBe("[a ［b］](https://x.jp)");
});
