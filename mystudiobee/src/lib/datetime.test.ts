import { describe, it, expect, vi } from "vitest";
import { workedMs } from "./datetime";

describe("workedMs", () => {
  it("computes full duration for a closed entry with no pauses", () => {
    const ms = workedMs({
      clocked_in_at: "2026-01-01T09:00:00.000Z",
      clocked_out_at: "2026-01-01T11:00:00.000Z",
    });
    expect(ms).toBe(2 * 60 * 60 * 1000);
  });

  it("subtracts accumulated paused_seconds from a closed entry", () => {
    const ms = workedMs({
      clocked_in_at: "2026-01-01T09:00:00.000Z",
      clocked_out_at: "2026-01-01T11:00:00.000Z",
      paused_seconds: 15 * 60,
    });
    expect(ms).toBe(2 * 60 * 60 * 1000 - 15 * 60 * 1000);
  });

  it("counts an in-progress pause on an open entry as elapsed but non-worked", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00.000Z"));
    const ms = workedMs({
      clocked_in_at: "2026-01-01T09:00:00.000Z",
      clocked_out_at: null,
      paused_seconds: 0,
      paused_at: "2026-01-01T09:45:00.000Z",
    });
    // 1h elapsed, last 15m of it paused -> 45m worked
    expect(ms).toBe(45 * 60 * 1000);
    vi.useRealTimers();
  });

  it("freezes worked time while paused as real time advances", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T09:45:00.000Z"));
    const entry = {
      clocked_in_at: "2026-01-01T09:00:00.000Z",
      clocked_out_at: null,
      paused_seconds: 0,
      paused_at: "2026-01-01T09:45:00.000Z",
    };
    const first = workedMs(entry);
    vi.setSystemTime(new Date("2026-01-01T09:50:00.000Z"));
    const second = workedMs(entry);
    expect(first).toBe(second);
    vi.useRealTimers();
  });

  it("never returns a negative duration", () => {
    const ms = workedMs({
      clocked_in_at: "2026-01-01T09:00:00.000Z",
      clocked_out_at: "2026-01-01T09:05:00.000Z",
      paused_seconds: 60 * 60,
    });
    expect(ms).toBe(0);
  });
});
