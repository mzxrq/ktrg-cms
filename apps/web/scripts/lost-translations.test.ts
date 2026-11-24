import { describe, expect, test } from "bun:test";
import { lostTranslations } from "./resolve-catalogs-lib";

const po = (...blocks: string[]) => ['msgid ""\nmsgstr ""\n"Language: en\n"', ...blocks].join("\n\n") + "\n";

describe("translations lost when the Japanese is reworded", () => {
  test("a dropped message is listed with its old English and the new untranslated message of the same file", () => {
    const before = po('#: src/a.tsx:3\nmsgid "古い文"\nmsgstr "Old line"', '#: src/a.tsx:9\nmsgid "そのまま"\nmsgstr "Same"');
    const after = po('#: src/a.tsx:3\nmsgid "新しい文"\nmsgstr ""', '#: src/a.tsx:9\nmsgid "そのまま"\nmsgstr "Same"', '#: src/b.tsx:1\nmsgid "別のファイル"\nmsgstr ""');
    expect(lostTranslations(before, after)).toEqual([{ was: "古い文", translation: "Old line", files: ["src/a.tsx"], candidates: ["新しい文"] }]);
  });

  test("nothing reworded, nothing listed", () => {
    const same = po('#: src/a.tsx:3\nmsgid "文"\nmsgstr "Line"');
    expect(lostTranslations(same, same)).toEqual([]);
  });
});
