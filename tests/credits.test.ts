import { describe, it, expect } from 'vitest'
import {
  ensureUser,
  getBalance,
  reserveCredit,
  refundReservation,
  grantTopup,
  mergeAnonIntoReal,
  InsufficientCredits,
  FREE_GRANT,
} from '@/lib/credits'

describe('credits ledger', () => {
  it('grants 4 free credits on user creation', async () => {
    const { id } = await ensureUser('a@test.dev')
    expect(await getBalance(id)).toBe(FREE_GRANT)
  })

  it('does not re-grant credits for existing user', async () => {
    const { id } = await ensureUser('b@test.dev')
    await ensureUser('b@test.dev')
    expect(await getBalance(id)).toBe(FREE_GRANT)
  })

  it('reserves credit, decrements balance', async () => {
    const { id } = await ensureUser('c@test.dev')
    const r = await reserveCredit(id, 'generate')
    expect(r.balanceAfter).toBe(FREE_GRANT - 1)
    expect(await getBalance(id)).toBe(FREE_GRANT - 1)
  })

  it('refunds reservation (idempotent)', async () => {
    const { id } = await ensureUser('d@test.dev')
    const r = await reserveCredit(id, 'generate')
    await refundReservation(r.reservationId)
    await refundReservation(r.reservationId)
    expect(await getBalance(id)).toBe(FREE_GRANT)
  })

  it('throws InsufficientCredits when balance is 0', async () => {
    const { id } = await ensureUser('e@test.dev')
    for (let i = 0; i < FREE_GRANT; i++) await reserveCredit(id, 'generate')
    expect(await getBalance(id)).toBe(0)
    await expect(reserveCredit(id, 'generate')).rejects.toBeInstanceOf(InsufficientCredits)
  })

  it('concurrent reserves cannot double-spend', async () => {
    const { id } = await ensureUser('f@test.dev')
    const attempts = Array.from({ length: 10 }, () =>
      reserveCredit(id, 'generate').catch((e) => e)
    )
    const results = await Promise.all(attempts)
    const successes = results.filter((r) => !(r instanceof Error))
    const failures = results.filter((r) => r instanceof InsufficientCredits)
    expect(successes.length).toBe(FREE_GRANT)
    expect(failures.length).toBe(10 - FREE_GRANT)
    expect(await getBalance(id)).toBe(0)
  })

  it('grantTopup adds to balance', async () => {
    const { id } = await ensureUser('g@test.dev')
    await grantTopup(id, 200, 'cs_test_123')
    expect(await getBalance(id)).toBe(FREE_GRANT + 200)
  })

  it('merges anon user credits into real user', async () => {
    const { id: anon } = await ensureUser('anon:device-xyz')
    await reserveCredit(anon, 'generate')
    const { id: real } = await ensureUser('real@test.dev')
    await mergeAnonIntoReal(anon, real)
    expect(await getBalance(real)).toBe(FREE_GRANT + (FREE_GRANT - 1))
  })
})
