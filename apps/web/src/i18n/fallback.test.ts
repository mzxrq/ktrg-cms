import { describe, expect, test } from "bun:test";
import type { Messages } from "@lingui/core";
import { withFallback } from "./fallback";

describe("a preview language's messages", () => {
  test("its own text wins; unwritten ones (empty, or the Japanese source) read the English", () => {
    const ja: Messages = { a: "こんにちは", b: "地図", c: ["スタンプ ", ["0"]] };
    const en: Messages = { a: "Hello", b: "Map", c: ["Stamp ", ["0"]] };
    const th: Messages = { a: "สวัสดี", b: "地図", c: "" };
    expect(withFallback(th, ja, en)).toEqual({ a: "สวัสดี", b: "Map", c: ["Stamp ", ["0"]] });
  });
});
