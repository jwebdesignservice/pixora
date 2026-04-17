import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { stripeEvents, creditLedger } from '@/db/schema'
import { stripe, creditsForPriceId } from '@/lib/stripe'
import { grantTopup } from '@/lib/credits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature')
  if (!sig) return NextResponse.json({ error: 'missing_signature' }, { status: 400 })

  const raw = await req.text()
  let event
  try {
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET ?? '')
  } catch (err) {
    console.error('[stripe webhook] signature verification failed', err)
    return NextResponse.json({ error: 'bad_signature' }, { status: 400 })
  }

  try {
    await db.insert(stripeEvents).values({ eventId: event.id })
  } catch {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as { id: string }
      const full = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items'],
      })
      if (full.payment_status !== 'paid') {
        return NextResponse.json({ ok: true, skipped: 'unpaid' })
      }
      const userId = full.client_reference_id
      const priceId = full.line_items?.data[0]?.price?.id
      const credits = priceId ? creditsForPriceId(priceId) : null
      if (!userId || !credits) {
        console.warn('[stripe webhook] missing userId or credits', { userId, priceId })
        return NextResponse.json({ ok: true, skipped: 'missing_meta' })
      }
      await grantTopup(userId, credits, full.id)
    } else if (event.type === 'charge.refunded') {
      const charge = event.data.object as { payment_intent?: string | null }
      const piId = charge.payment_intent
      if (!piId) return NextResponse.json({ ok: true })
      const sessions = await stripe.checkout.sessions.list({
        payment_intent: piId,
        limit: 1,
        expand: ['data.line_items'],
      })
      const session = sessions.data[0]
      if (!session) return NextResponse.json({ ok: true, skipped: 'session_not_found' })
      const userId = session.client_reference_id
      const priceId = session.line_items?.data[0]?.price?.id
      const credits = priceId ? creditsForPriceId(priceId) : null
      if (!userId || !credits) return NextResponse.json({ ok: true, skipped: 'missing_meta' })
      const existing = await db
        .select()
        .from(creditLedger)
        .where(and(eq(creditLedger.reason, 'refund'), eq(creditLedger.refId, session.id)))
        .limit(1)
      if (!existing[0]) {
        await db.insert(creditLedger).values({
          userId,
          delta: -credits,
          reason: 'refund',
          refId: session.id,
        })
      }
    }
  } catch (e) {
    console.error('[stripe webhook] handler error', e)
    return NextResponse.json({ error: 'handler_failed' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
