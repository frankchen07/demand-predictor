import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// prepare: false is required for Supabase's transaction-mode pooler (pgbouncer, port 6543) —
// prepared statements aren't safe across pooled connections. Harmless no-op against local Postgres.
const client = postgres(process.env.DATABASE_URL!, { prepare: false });

export const db = drizzle(client, { schema });
