import { describe, expect, it } from "vitest";
import { countInWindow, isWindowFull, nextSlotAt, WINDOW_MS } from "./ig-limiter";

const NOW = new Date("2026-07-23T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

describe("ig rolling-window limiter", () => {
  it("counts only publishes inside the trailing 24h", () => {
    const published = [hoursAgo(1), hoursAgo(23.9), hoursAgo(24.1), hoursAgo(48)];
    expect(countInWindow(published, NOW)).toBe(2);
  });

  it("is not full below the cap and full at the cap", () => {
    const twentyFour = Array.from({ length: 24 }, (_, i) => hoursAgo(i * 0.5));
    expect(isWindowFull(twentyFour, 25, NOW)).toBe(false);
    const twentyFive = [...twentyFour, hoursAgo(13)];
    expect(isWindowFull(twentyFive, 25, NOW)).toBe(true);
  });

  it("publishes older than 24h never count against the cap", () => {
    const stale = Array.from({ length: 100 }, (_, i) => hoursAgo(25 + i));
    expect(countInWindow(stale, NOW)).toBe(0);
    expect(isWindowFull(stale, 25, NOW)).toBe(false);
    expect(nextSlotAt(stale, 25, NOW)).toBeNull();
  });

  it("next slot is when the oldest in-window publish ages out (cap exactly met)", () => {
    const published = Array.from({ length: 25 }, (_, i) => hoursAgo(23 - i * 0.5));
    const slot = nextSlotAt(published, 25, NOW)!;
    const oldest = hoursAgo(23);
    expect(slot.getTime()).toBe(oldest.getTime() + WINDOW_MS + 1000);
    // and the slot is in the future
    expect(slot.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("next slot with an over-full window waits for enough to age out", () => {
    // 27 publishes in-window: two must age out before a slot opens; the
    // gate is the 3rd oldest.
    const published = Array.from({ length: 27 }, (_, i) => hoursAgo(23.5 - i * 0.5));
    const slot = nextSlotAt(published, 25, NOW)!;
    const gate = hoursAgo(22.5);
    expect(slot.getTime()).toBe(gate.getTime() + WINDOW_MS + 1000);
  });

  it("returns null when the window has room", () => {
    expect(nextSlotAt([hoursAgo(1)], 25, NOW)).toBeNull();
    expect(nextSlotAt([], 25, NOW)).toBeNull();
  });
});
