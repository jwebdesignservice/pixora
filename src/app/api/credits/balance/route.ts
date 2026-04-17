import { NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { creditLedger, stripeEvents } from '@/db/schema'
import { resolveIdentity } from '@/lib/auth'
import { getBalance, grantTopup } from '@/lib/credits'
import { stripe, creditsForPriceId } from '@/lib/stripe'
import { jsonError, jsonOk } from '@/lib/errors'
import { preflight } from '@/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req)
}

export async function GET(req: NextRequest) {
  const identity = await resolveIdentity(req)
  if (!identity) return jsonError(req, 401, 'auth_required')

  const url = new URL(req.url)
  const pending = url.searchParams.get('pendingSessionId')
  if (pending && identity.kind === 'real') {
    const seen = await db
      .select()
      .from(creditLedger)
      .where(and(eq(creditLedger.refId, pending), eq(creditLedger.reason, 'topup')))
      .limit(1)
    if (!seen[0]) {
      try {
        const session = await stripe.checkout.sessions.retrieve(pending, {
          expand: ['line_items'],
        })
        if (
          session.payment_status === 'paid' &&
          session.client_reference_id === identity.userId
        ) {
          const priceId = session.line_items?.data[0]?.price?.id
          const credits = priceId ? creditsForPriceId(priceId) : null
          if (credits) {
            const evId = `reconcile:${session.id}`
            try {
              await db.insert(stripeEvents).values({ eventId: evId })
              await grantTopup(identity.userId, credits, session.id)
            } catch {
              // duplicate; already reconciled
            }
          }
        }
      } catch (e) {
        console.error('[balance] reconcile error', e)
      }
    }
  }

  const balance = await getBalance(identity.userId)
  return jsonOk(req, {
    balance,
    identity: { email: identity.email, kind: identity.kind },
  })
}
