import { NextRequest } from 'next/server'
import { z } from 'zod'
import { and, eq, gte, isNull, desc } from 'drizzle-orm'
import { db } from '@/db/client'
import { authCodes } from '@/db/schema'
import { hashCode, signSession } from '@/lib/auth'
import { ensureUser, mergeAnonIntoReal } from '@/lib/credits'
import { jsonError, jsonOk } from '@/lib/errors'
import { preflight } from '@/lib/cors'

const BodySchema = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  code: z.string().regex(/^\d{6}$/),
  deviceId: z.string().min(8).max(64).optional(),
})

export async function OPTIONS(req: NextRequest) {
  return preflight(req)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return jsonError(req, 400, 'invalid_body')

  const { email, code, deviceId } = parsed.data

  const now = new Date()
  const row = await db
    .select()
    .from(authCodes)
    .where(and(eq(authCodes.email, email), isNull(authCodes.consumedAt), gte(authCodes.expiresAt, now)))
    .orderBy(desc(authCodes.expiresAt))
    .limit(1)

  if (!row[0]) return jsonError(req, 401, 'code_invalid')
  if (row[0].attempts >= 5) return jsonError(req, 401, 'code_burned')

  if (row[0].codeHash !== hashCode(code)) {
    await db
      .update(authCodes)
      .set({ attempts: row[0].attempts + 1 })
      .where(eq(authCodes.id, row[0].id))
    return jsonError(req, 401, 'code_invalid')
  }

  await db.update(authCodes).set({ consumedAt: now }).where(eq(authCodes.id, row[0].id))

  const { id: realId } = await ensureUser(email)
  if (deviceId) {
    const anonEmail = `anon:${deviceId}`
    const { id: anonId } = await ensureUser(anonEmail)
    if (anonId !== realId) await mergeAnonIntoReal(anonId, realId)
  }

  const token = await signSession(realId, email)
  return jsonOk(req, { token, userId: realId, email })
}
