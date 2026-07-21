import { describe, it, expect } from "vitest";
import { validateAvatarFile, MAX_AVATAR_BYTES } from "./avatar-validation";

function makeFile(sizeBytes: number, type: string, name = "avatar.png") {
  return new File([new Uint8Array(sizeBytes)], name, { type });
}

describe("validateAvatarFile", () => {
  it("accepts a small png", () => {
    expect(validateAvatarFile(makeFile(1024, "image/png"))).toBeNull();
  });

  it("accepts jpeg, webp, and gif", () => {
    expect(validateAvatarFile(makeFile(1024, "image/jpeg"))).toBeNull();
    expect(validateAvatarFile(makeFile(1024, "image/webp"))).toBeNull();
    expect(validateAvatarFile(makeFile(1024, "image/gif"))).toBeNull();
  });

  it("rejects a non-image type", () => {
    expect(validateAvatarFile(makeFile(1024, "application/pdf"))).toMatch(/JPG|PNG|WEBP|GIF/i);
  });

  it("rejects a file over 5MB", () => {
    expect(validateAvatarFile(makeFile(MAX_AVATAR_BYTES + 1, "image/png"))).toMatch(/5MB/);
  });

  it("accepts a file exactly at the 5MB limit", () => {
    expect(validateAvatarFile(makeFile(MAX_AVATAR_BYTES, "image/png"))).toBeNull();
  });
});
