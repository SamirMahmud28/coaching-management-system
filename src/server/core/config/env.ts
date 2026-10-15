import { z } from "zod";

// Server code reads configuration through getEnv, never process.env directly.
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  // Separate so a leaked institute secret can't forge a platform session.
  PLATFORM_AUTH_SECRET: z.string().min(32),
  // e.g. "localhost:3000" in development, the product domain in production (not decided yet).
  APP_BASE_DOMAIN: z.string().min(1),
  PLATFORM_HOST: z.string().min(1),
  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().min(1).default("./storage"),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`,
    );
  }
  cached = parsed.data;
  return cached;
}
