import { config } from "dotenv";
import { existsSync } from "node:fs";

// Prefer .env.test (the test database); fall back to .env for tests that only need valid config.
const testEnvPath = ".env.test";
config({ path: existsSync(testEnvPath) ? testEnvPath : ".env", quiet: true });
