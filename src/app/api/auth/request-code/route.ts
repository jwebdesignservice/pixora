import { NextRequest } from 'next/server'
import { z } from 'zod'
import { and, eq, gte, count } from 'drizzle-orm'
import { db } from '@/db/client'
import { authCodes } from '@/db/schema'
import { generateMagicCode, hashCode } from '@/lib/auth'
import { sendMagicCode } from '@/lib/email'
import { jsonError, jsonOk } from '@/lib/errors'
import { preflight } from '@/lib/cors'

const BodySchema = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  deviceId: z.string().min(8).max(64).optional(),
})

export async function OPTIONS(req: NextRequest) {
  return preflight(req)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return jsonError(req, 400, 'invalid_body')

  const { email } = parsed.data

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const recent = await db
    .select({ c: count() })
    .from(authCodes)
    .where(and(eq(authCodes.email, email), gte(authCodes.expiresAt, oneHourAgo)))
  if ((recent[0]?.c ?? 0) >= 5) return jsonError(req, 429, 'rate_limited')

  const code = generateMagicCode()
  await db.insert(authCodes).values({
    email,
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  })

  try {
    await sendMagicCode(email, code)
  } catch (e) {
    console.error('[request-code] email error', e)
    return jsonError(req, 503, 'email_failed')
  }

  return jsonOk(req, { ok: true })
}
