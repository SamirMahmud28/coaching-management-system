// Runs a command with an env file loaded first, e.g. `node scripts/with-env.mjs .env.test drizzle-kit migrate`.
// Variables already set win over the file, and drizzle.config.ts's own `dotenv/config` doesn't override them either.
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

const [envFile, command, ...args] = process.argv.slice(2);
if (!envFile || !command) {
  console.error("Usage: node scripts/with-env.mjs <env-file> <command> [...args]");
  process.exit(1);
}
const loaded = config({ path: envFile, quiet: true });
if (loaded.error) {
  console.error(`Couldn't read ${envFile}: ${loaded.error.message}`);
  process.exit(1);
}
const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
