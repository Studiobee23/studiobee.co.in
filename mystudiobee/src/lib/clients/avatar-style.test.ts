import { describe, it, expect } from "vitest";
import { getInitials, getAvatarColorClass } from "./avatar-style";

describe("getInitials", () => {
  it("takes the first letter of the first two words, uppercased", () => {
    expect(getInitials("Acme Corp")).toBe("AC");
  });

  it("takes the first two letters of a single word", () => {
    expect(getInitials("Acme")).toBe("AC");
  });

  it("falls back to ? for an empty or whitespace-only name", () => {
    expect(getInitials("   ")).toBe("?");
  });

  it("ignores extra whitespace between words", () => {
    expect(getInitials("  Bloom   Studio  ")).toBe("BS");
  });
});

describe("getAvatarColorClass", () => {
  const KNOWN_CLASSES = ["bg-chart-1", "bg-chart-2", "bg-chart-5"];

  it("always returns the same class for the same name", () => {
    expect(getAvatarColorClass("Acme Corp")).toBe(getAvatarColorClass("Acme Corp"));
  });

  it("returns one of the known chart color classes", () => {
    expect(KNOWN_CLASSES).toContain(getAvatarColorClass("Some Client"));
  });
});
