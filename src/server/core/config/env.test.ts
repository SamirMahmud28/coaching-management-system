import { describe, expect, it } from "vitest";
import { envSchema } from "./env";

const validEnv = {
  DATABASE_URL: "postgresql://app:app@localhost:5432/cms",
  AUTH_SECRET: "a".repeat(32),
  PLATFORM_AUTH_SECRET: "b".repeat(32),
  APP_BASE_DOMAIN: "localhost:3000",
  PLATFORM_HOST: "admin.localhost:3000",
};

describe("env schema", () => {
  it("accepts a fully valid environment", () => {
    expect(envSchema.safeParse(validEnv).success).toBe(true);
  });

  it("defaults NODE_ENV and storage settings", () => {
    const parsed = envSchema.parse(validEnv);
    expect(parsed.NODE_ENV).toBe("development");
    expect(parsed.STORAGE_DRIVER).toBe("local");
    expect(parsed.STORAGE_LOCAL_DIR).toBe("./storage");
  });

  it("rejects a missing DATABASE_URL", () => {
    const rest: Partial<typeof validEnv> = { ...validEnv };
    delete rest.DATABASE_URL;
    expect(envSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects AUTH_SECRET and PLATFORM_AUTH_SECRET under 32 characters", () => {
    expect(envSchema.safeParse({ ...validEnv, AUTH_SECRET: "too-short" }).success).toBe(false);
    expect(envSchema.safeParse({ ...validEnv, PLATFORM_AUTH_SECRET: "too-short" }).success).toBe(false);
  });

  it("rejects a non-URL DATABASE_URL", () => {
    expect(envSchema.safeParse({ ...validEnv, DATABASE_URL: "not-a-url" }).success).toBe(false);
  });
});
