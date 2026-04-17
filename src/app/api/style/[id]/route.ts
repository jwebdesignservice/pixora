import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { creditLedger } from '@/db/schema'
import { refundReservation } from '@/lib/credits'
import { corsHeaders, preflight } from '@/lib/cors'

export async function OPTIONS(req: NextRequest) {
  return preflight(req)
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const cors = corsHeaders(req.headers.get('origin'))
  try {
    const { id } = await params
    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
    const prediction = await replicate.predictions.get(id)

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      const [reservation] = await db
        .select()
        .from(creditLedger)
        .where(and(eq(creditLedger.refId, id), eq(creditLedger.reason, 'style')))
        .limit(1)
      if (reservation) await refundReservation(reservation.id)
    }

    const outputUrl =
      prediction.status === 'succeeded' && Array.isArray(prediction.output)
        ? (prediction.output[0] as string)
        : prediction.status === 'succeeded'
        ? (prediction.output as string)
        : null

    return NextResponse.json({ status: prediction.status, outputUrl }, { headers: cors })
  } catch (err) {
    console.error('[style/[id]] Error:', err)
    return NextResponse.json(
      { error: 'Failed to check prediction' },
      { status: 500, headers: cors }
    )
  }
}
