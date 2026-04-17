import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

declare global {
  // eslint-disable-next-line no-var
  var __pixora_pool: Pool | undefined
}

// Prefer DATABASE_URL (local .env.local) but fall back to POSTGRES_URL
// which the Vercel Supabase integration auto-sets in production.
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL

const pool =
  global.__pixora_pool ??
  new Pool({
    connectionString,
    max: 5,
  })

if (process.env.NODE_ENV !== 'production') global.__pixora_pool = pool

export const db = drizzle(pool, { schema })
export { pool }
