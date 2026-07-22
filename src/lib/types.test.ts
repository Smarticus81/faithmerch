import { describe, expect, it } from "vitest";
import { failedCheckCount, hasFailedCheck, type Check } from "./types";

const checks: Check[] = [
  { key: "verse_match", status: "pass", note: "matches KJV corpus" },
  { key: "translation_license", status: "fail", note: "NIV excluded" },
  { key: "resolution", status: "fail", note: "150 DPI below minimum" },
  { key: "alpha_halo", status: "warn", note: "fringing on 4% of edges" },
];

describe("check helpers", () => {
  it("hasFailedCheck is true only for fail status", () => {
    expect(hasFailedCheck({ checks })).toBe(true);
    expect(hasFailedCheck({ checks: checks.filter((c) => c.status !== "fail") })).toBe(false);
    expect(hasFailedCheck({ checks: [] })).toBe(false);
  });

  it("failedCheckCount counts fails, not warns", () => {
    expect(failedCheckCount({ checks })).toBe(2);
    expect(failedCheckCount({ checks: [] })).toBe(0);
  });
});
