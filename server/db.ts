import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL is not set — database operations will fail at runtime");
}

// Cap at 5 connections — leaves room for the session store pool (max: 2)
// and stays well within Supabase free-tier limit of 15.
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "", max: 5 });

export const db = drizzle(pool, { schema });
