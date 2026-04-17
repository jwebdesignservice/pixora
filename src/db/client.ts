import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

declare global {
  // eslint-disable-next-line no-var
  var __pixora_pool: Pool | undefined
}

const pool =
  global.__pixora_pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  })

if (process.env.NODE_ENV !== 'production') global.__pixora_pool = pool

export const db = drizzle(pool, { schema })
export { pool }
