import { hash, verify } from "@node-rs/argon2";

// Argon2id with @node-rs/argon2 defaults (m=19456 KiB, t=2, p=1), the OWASP minimum.
export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordProblem } from "@/lib/password-rule";
