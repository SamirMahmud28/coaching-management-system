import { describe, expect, it } from "vitest";
import { classifyHost, isValidTenantSubdomain, type HostConfig } from "./host";

const dev: HostConfig = { baseDomain: "localhost:3000", platformHost: "admin.localhost:3000" };
const prod: HostConfig = { baseDomain: "khatakolom.lms", platformHost: "admin.khatakolom.lms" };

describe("classifyHost", () => {
  it("recognizes a school subdomain, with or without a port", () => {
    expect(classifyHost("demo.localhost:3000", dev)).toEqual({ kind: "tenant", subdomain: "demo" });
    expect(classifyHost("greenfield.khatakolom.lms", prod)).toEqual({ kind: "tenant", subdomain: "greenfield" });
  });

  it("recognizes the platform host and never treats it as a tenant", () => {
    expect(classifyHost("admin.localhost:3000", dev)).toEqual({ kind: "platform" });
    expect(classifyHost("admin.khatakolom.lms", prod)).toEqual({ kind: "platform" });
  });

  it("recognizes the bare domain as the root site", () => {
    expect(classifyHost("localhost:3000", dev)).toEqual({ kind: "root" });
    expect(classifyHost("khatakolom.lms", prod)).toEqual({ kind: "root" });
  });

  it("is case-insensitive and tolerates a trailing dot", () => {
    expect(classifyHost("Demo.LocalHost:3000", dev)).toEqual({ kind: "tenant", subdomain: "demo" });
    expect(classifyHost("greenfield.khatakolom.lms.", prod)).toEqual({ kind: "tenant", subdomain: "greenfield" });
    expect(classifyHost("ADMIN.khatakolom.lms", prod)).toEqual({ kind: "platform" });
  });

  it("rejects hosts outside our domain, a wrong port, and multi-level subdomains", () => {
    expect(classifyHost("evil.com", prod)).toEqual({ kind: "unknown" });
    expect(classifyHost("demo.localhost:4000", dev)).toEqual({ kind: "unknown" });
    expect(classifyHost("a.b.khatakolom.lms", prod)).toEqual({ kind: "unknown" });
    expect(classifyHost("khatakolom.lms.evil.com", prod)).toEqual({ kind: "unknown" });
  });

  it("never resolves a reserved or malformed name to a tenant", () => {
    expect(classifyHost("www.khatakolom.lms", prod)).toEqual({ kind: "unknown" });
    expect(classifyHost("api.khatakolom.lms", prod)).toEqual({ kind: "unknown" });
    expect(classifyHost("ab.khatakolom.lms", prod)).toEqual({ kind: "unknown" }); // too short
    expect(classifyHost("-bad.khatakolom.lms", prod)).toEqual({ kind: "unknown" });
    expect(classifyHost("bad_name.khatakolom.lms", prod)).toEqual({ kind: "unknown" });
  });

  it("treats a missing Host header as unknown", () => {
    expect(classifyHost(null, prod)).toEqual({ kind: "unknown" });
    expect(classifyHost("", prod)).toEqual({ kind: "unknown" });
  });
});

describe("isValidTenantSubdomain", () => {
  it("accepts 3–63 lowercase letters, digits and inner hyphens", () => {
    expect(isValidTenantSubdomain("abc")).toBe(true);
    expect(isValidTenantSubdomain("green-field-school")).toBe(true);
    expect(isValidTenantSubdomain("a".repeat(63))).toBe(true);
  });

  it("rejects too short, too long, bad characters, edge hyphens and reserved names", () => {
    expect(isValidTenantSubdomain("ab")).toBe(false);
    expect(isValidTenantSubdomain("a".repeat(64))).toBe(false);
    expect(isValidTenantSubdomain("School")).toBe(false);
    expect(isValidTenantSubdomain("-abc")).toBe(false);
    expect(isValidTenantSubdomain("abc-")).toBe(false);
    expect(isValidTenantSubdomain("admin")).toBe(false);
    expect(isValidTenantSubdomain("lms")).toBe(false); // the separate LMS product's address
  });
});
