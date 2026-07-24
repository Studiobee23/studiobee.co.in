import { describe, it, expect } from "vitest";
import { isAdminTier, isSuperAdmin, canSeeCost, isBillingRole } from "./profile";

describe("isAdminTier", () => {
  it("is true for admin and super_admin", () => {
    expect(isAdminTier("admin")).toBe(true);
    expect(isAdminTier("super_admin")).toBe(true);
  });
  it("is false for manager and employee", () => {
    expect(isAdminTier("manager")).toBe(false);
    expect(isAdminTier("employee")).toBe(false);
  });
});

describe("isSuperAdmin", () => {
  it("is true only for super_admin", () => {
    expect(isSuperAdmin("super_admin")).toBe(true);
    expect(isSuperAdmin("admin")).toBe(false);
    expect(isSuperAdmin("manager")).toBe(false);
    expect(isSuperAdmin("employee")).toBe(false);
  });
});

describe("canSeeCost", () => {
  it("matches isAdminTier", () => {
    expect(canSeeCost("super_admin")).toBe(true);
    expect(canSeeCost("admin")).toBe(true);
    expect(canSeeCost("manager")).toBe(false);
    expect(canSeeCost("employee")).toBe(false);
  });
});

describe("isBillingRole", () => {
  it("is true for super_admin, admin, and manager", () => {
    expect(isBillingRole("super_admin")).toBe(true);
    expect(isBillingRole("admin")).toBe(true);
    expect(isBillingRole("manager")).toBe(true);
  });
  it("is false for employee", () => {
    expect(isBillingRole("employee")).toBe(false);
  });
});
