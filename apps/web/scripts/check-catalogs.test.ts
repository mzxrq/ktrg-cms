import { expect, test } from "bun:test";
import { catalogText, missingTranslations } from "./check-catalogs";

test("catalogText ignores line endings and source lines, but not the messages", () => {
  const a = `#: a.tsx:1\nmsgid "完了"\nmsgstr "Done"\n`;
  expect(catalogText(a)).toBe(catalogText(`#: a.tsx:9\r\nmsgid "完了"\r\nmsgstr "Done"\r\n`));
  expect(catalogText(a)).not.toBe(catalogText(`#: a.tsx:1\nmsgid "完了"\nmsgstr "Finished"\n`));
});

test("finds messages with no English text, ignoring the header and multi-line texts", () => {
  const po = `msgid ""\nmsgstr ""\n"Language: en\\n"\n\n#: a.tsx:1\nmsgid "完了"\nmsgstr "Done"\n\n#: a.tsx:2\nmsgid "未訳"\nmsgstr ""\n\n#: a.tsx:3\nmsgid ""\n"長い"\n"文"\nmsgstr ""\n"A long "\n"text"\n`;
  expect(missingTranslations(po)).toEqual(["未訳"]);
});
