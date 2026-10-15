import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "../config/env";

/**
 * Where uploaded bytes live. Modules never touch this directly — they go
 * through the files service, so switching to an S3-compatible provider later is a configuration change.
 */
export interface StorageProvider {
  put(key: string, data: Buffer): Promise<void>;
  /** null when the object doesn't exist. */
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

// Keys are built by the files service: "{tenantUuid}/{category}/{fileUuid}.{ext}". Anything else is refused,
// so a malformed key can never escape the storage root.
const KEY_PATTERN = /^[0-9a-f-]{36}\/[a-z_]{1,40}\/[0-9a-f-]{36}\.(jpg|png)$/;

export class LocalDiskStorage implements StorageProvider {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private pathFor(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error(`Invalid storage key: ${key}`);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error(`Storage key escapes the root: ${key}`);
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(path.dirname(target), { recursive: true });
    // Write then rename, so a reader never sees a half-written file.
    const temp = `${target}.${randomUUID()}.tmp`;
    await writeFile(temp, data);
    await rename(temp, target);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}

let cached: StorageProvider | undefined;

export function storageFromEnv(): StorageProvider {
  if (cached) return cached;
  const env = getEnv();
  switch (env.STORAGE_DRIVER) {
    case "local":
      cached = new LocalDiskStorage(env.STORAGE_LOCAL_DIR);
      return cached;
  }
}
