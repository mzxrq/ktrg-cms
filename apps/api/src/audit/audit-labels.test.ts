import { describe, expect, test } from "bun:test";
import { AUDIT_ACTIONS, type AuditAction } from "./audit-log";
import { auditActionLabel } from "./audit-labels";

describe("auditActionLabel", () => {
  test("every action reads as words in both languages, never as its code", () => {
    for (const action of Object.keys(AUDIT_ACTIONS) as AuditAction[]) {
      const label = auditActionLabel(action);
      expect({ action, ja: label.ja === action, en: label.en === action }).toEqual({ action, ja: false, en: false });
    }
  });
  test("an item and a verb, or whole words", () => {
    expect(auditActionLabel("route.update")).toEqual({ ja: "コースを変更", en: "Course changed" });
    expect(auditActionLabel("spot.unpublish")).toEqual({ ja: "経由地の公開をやめた", en: "Waypoint unpublished" });
    expect(auditActionLabel("upload.create")).toEqual({ ja: "写真をアップロード", en: "Photo uploaded" });
  });
});
