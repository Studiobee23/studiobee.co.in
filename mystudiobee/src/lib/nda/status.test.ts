import { describe, it, expect } from "vitest";
import { deriveNdaStatus } from "./status";

describe("deriveNdaStatus", () => {
  it("returns 'pending' for a pending row that hasn't expired", () => {
    const now = new Date("2026-09-22T00:00:00.000Z");
    const status = deriveNdaStatus(
      { status: "pending", expires_at: "2026-10-01T00:00:00.000Z" },
      now
    );
    expect(status).toBe("pending");
  });

  it("returns 'expired' for a pending row past its expires_at", () => {
    const now = new Date("2026-09-22T00:00:00.000Z");
    const status = deriveNdaStatus(
      { status: "pending", expires_at: "2026-09-01T00:00:00.000Z" },
      now
    );
    expect(status).toBe("expired");
  });

  it("returns 'signed' for a signed row even if expires_at is in the past", () => {
    const now = new Date("2026-09-22T00:00:00.000Z");
    const status = deriveNdaStatus(
      { status: "signed", expires_at: "2026-01-01T00:00:00.000Z" },
      now
    );
    expect(status).toBe("signed");
  });

  it("returns 'voided' for a voided row regardless of expiry", () => {
    const now = new Date("2026-09-22T00:00:00.000Z");
    const status = deriveNdaStatus(
      { status: "voided", expires_at: "2026-01-01T00:00:00.000Z" },
      now
    );
    expect(status).toBe("voided");
  });

  it("defaults `now` to the current time when omitted", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(deriveNdaStatus({ status: "pending", expires_at: future })).toBe("pending");
  });
});
