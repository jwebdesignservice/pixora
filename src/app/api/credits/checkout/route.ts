import { NextRequest } from 'next/server'
import { z } from 'zod'
import { resolveIdentity } from '@/lib/auth'
import { stripe, creditsForPriceId } from '@/lib/stripe'
import { jsonError, jsonOk } from '@/lib/errors'
import { preflight } from '@/lib/cors'

const BodySchema = z.object({ priceId: z.string().min(1) })

export async function OPTIONS(req: NextRequest) {
  return preflight(req)
}

export async function POST(req: NextRequest) {
  const identity = await resolveIdentity(req)
  if (!identity || identity.kind !== 'real') return jsonError(req, 401, 'auth_required')

  const body = await req.json().catch(() => null)
  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) return jsonError(req, 400, 'invalid_body')

  if (creditsForPriceId(parsed.data.priceId) === null) {
    return jsonError(req, 400, 'invalid_price')
  }

  const origin = (process.env.ALLOWED_ORIGIN ?? '').split(',')[0].trim()

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: parsed.data.priceId, quantity: 1 }],
    customer_email: identity.email,
    client_reference_id: identity.userId,
    success_url: `${origin}/pages/credits-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/products/custom-ai-print`,
    metadata: { userId: identity.userId, priceId: parsed.data.priceId },
    payment_intent_data: { metadata: { userId: identity.userId } },
  })

  return jsonOk(req, { url: session.url })
}
