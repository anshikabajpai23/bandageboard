import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __pgClient: ReturnType<typeof postgres> | undefined;
}

function getConnection() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in."
    );
  }
  // Reuse a single client in dev / serverless warm starts.
  if (!global.__pgClient) {
    global.__pgClient = postgres(url, { max: 5, prepare: false });
  }
  return global.__pgClient;
}

export const db = drizzle(getConnection(), { schema });
export { schema };
