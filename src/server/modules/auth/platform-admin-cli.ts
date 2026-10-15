import "dotenv/config";
import * as readline from "node:readline";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../../core/db/schema";
import { platformUsers } from "../../core/db/schema";
import { findPgError } from "../../core/errors";
import { passwordProblem } from "./password";
import { validEmail } from "./platform-admin-input";
import { createPlatformLogin } from "./platform-credentials";

// npm run platform:create-admin [--force]

// Repeated rl.question calls drop buffered lines on piped stdin; one shared iterator doesn't.
function makePrompt(rl: readline.Interface) {
  const lines = rl[Symbol.asyncIterator]();
  return async function prompt(question: string): Promise<string> {
    process.stdout.write(question);
    const { value, done } = await lines.next();
    if (done) throw new Error("Input ended unexpectedly.");
    return value;
  };
}

/** Masked input on a TTY; plain input when piped. */
function promptPassword(prompt: (question: string) => Promise<string>, question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    return prompt(question);
  }

  return new Promise((resolve) => {
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let input = "";
    const onData = (char: string) => {
      if (char === "\n" || char === "\r" || char === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input);
        return;
      }
      if (char === "\u0003") process.exit(130);
      if (char === "\u007f" || char === "\b") {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.write("\b \b");
        }
        return;
      }
      input += char;
      process.stdout.write("*");
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const force = process.argv.includes("--force");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");

  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  try {
    const existing = await db.select({ id: platformUsers.id }).from(platformUsers).limit(1);
    if (existing.length > 0 && !force) {
      console.error("A Platform Admin already exists. Re-run with --force to add another one.");
      process.exit(1);
    }

    const isTTY = !!process.stdin.isTTY;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const prompt = makePrompt(rl);
    const name = (await prompt("Name: ")).trim();
    const email = (await prompt("Email: ")).trim().toLowerCase();
    // Raw-mode password input needs readline detached; piped input keeps using it.
    if (isTTY) rl.close();

    if (!name) throw new Error("Name is required.");
    if (!validEmail(email)) throw new Error("Enter a valid email address.");

    let password: string;
    for (;;) {
      password = await promptPassword(prompt, "Password: ");
      const problem = passwordProblem(password);
      if (problem) {
        console.error(problem);
        continue;
      }
      const confirm = await promptPassword(prompt, "Confirm password: ");
      if (confirm !== password) {
        console.error("Passwords didn't match. Try again.");
        continue;
      }
      break;
    }
    if (!isTTY) rl.close();

    // The admin chose this password themselves, so no forced change on first login.
    let admin;
    try {
      admin = await createPlatformLogin(db, { name, email, password, mustChangePassword: false });
    } catch (err) {
      if (findPgError(err)?.code === "23505") throw new Error(`A Platform Admin with the email "${email}" already exists.`);
      throw err;
    }
    console.log(`Platform Admin created: ${admin.name} <${admin.email}> (${admin.id})`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
