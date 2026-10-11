import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "../config/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { queryClient?: ReturnType<typeof postgres> };

// Reuse the connection across Next.js hot-reloads in dev; a fresh pool per process otherwise.
const queryClient = globalForDb.queryClient ?? postgres(getEnv().DATABASE_URL, { max: 10 });
if (getEnv().NODE_ENV !== "production") globalForDb.queryClient = queryClient;

export const db = drizzle(queryClient, { schema });
export type Database = typeof db;
