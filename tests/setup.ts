import { beforeEach } from 'vitest'
import { pool } from '@/db/client'

beforeEach(async () => {
  await pool.query('TRUNCATE credit_ledger, auth_codes, stripe_events, users RESTART IDENTITY CASCADE')
})
