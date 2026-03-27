import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set — database operations will fail at runtime");
}

export const db = drizzle(process.env.DATABASE_URL || "", { schema });
