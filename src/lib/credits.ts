import { db, pool } from '@/db/client'
import { users, creditLedger } from '@/db/schema'
import { eq, sql, and } from 'drizzle-orm'

export type Reason = 'free_grant' | 'topup' | 'generate' | 'remove_bg' | 'style' | 'refund'

export const FREE_GRANT = 4

export async function getBalance(userId: string): Promise<number> {
  const rows = await db
    .select({ balance: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int` })
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
  return rows[0]?.balance ?? 0
}

export async function ensureUser(email: string): Promise<{ id: string; fresh: boolean }> {
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing[0]) return { id: existing[0].id, fresh: false }

  const inserted = await db.insert(users).values({ email }).returning({ id: users.id })
  const id = inserted[0].id
  await db.insert(creditLedger).values({ userId: id, delta: FREE_GRANT, reason: 'free_grant' })
  return { id, fresh: true }
}

export class InsufficientCredits extends Error {
  constructor(public balance: number) {
    super('insufficient_credits')
  }
}

export async function reserveCredit(
  userId: string,
  reason: Reason
): Promise<{ reservationId: string; balanceAfter: number }> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId])
    const bal = await client.query<{ balance: number }>(
      'SELECT coalesce(sum(delta), 0)::int AS balance FROM credit_ledger WHERE user_id = $1',
      [userId]
    )
    const current = bal.rows[0]?.balance ?? 0
    if (current < 1) {
      await client.query('ROLLBACK')
      throw new InsufficientCredits(current)
    }
    const ins = await client.query<{ id: string }>(
      `INSERT INTO credit_ledger (user_id, delta, reason) VALUES ($1, -1, $2) RETURNING id`,
      [userId, reason]
    )
    await client.query('COMMIT')
    return { reservationId: ins.rows[0].id, balanceAfter: current - 1 }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore rollback-after-rollback
    }
    throw e
  } finally {
    client.release()
  }
}

export async function commitReservation(reservationId: string, refId: string): Promise<void> {
  await db.update(creditLedger).set({ refId }).where(eq(creditLedger.id, reservationId))
}

export async function refundReservation(reservationId: string): Promise<void> {
  const existing = await db
    .select({ id: creditLedger.id })
    .from(creditLedger)
    .where(and(eq(creditLedger.reason, 'refund'), eq(creditLedger.refId, reservationId)))
    .limit(1)
  if (existing[0]) return
  const row = await db.select().from(creditLedger).where(eq(creditLedger.id, reservationId)).limit(1)
  if (!row[0]) return
  await db.insert(creditLedger).values({
    userId: row[0].userId,
    delta: 1,
    reason: 'refund',
    refId: reservationId,
  })
}

export async function grantTopup(userId: string, credits: number, sessionId: string): Promise<void> {
  await db.insert(creditLedger).values({ userId, delta: credits, reason: 'topup', refId: sessionId })
}

export async function mergeAnonIntoReal(anonUserId: string, realUserId: string): Promise<void> {
  if (anonUserId === realUserId) return
  await db.transaction(async (tx) => {
    await tx.update(creditLedger).set({ userId: realUserId }).where(eq(creditLedger.userId, anonUserId))
    await tx.delete(users).where(eq(users.id, anonUserId))
  })
}
