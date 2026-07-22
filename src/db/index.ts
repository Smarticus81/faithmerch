import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Lazy singleton so importing this module never opens a connection at build
 * time. Supabase's pooler (transaction mode) requires prepare: false.
 */
let _db: ReturnType<typeof createDb> | null = null;

function createDb() {
  const client = postgres(env("DATABASE_URL"), { prepare: false, max: 5 });
  return drizzle(client, { schema });
}

export function db() {
  _db ??= createDb();
  return _db;
}

export * from "./schema";
