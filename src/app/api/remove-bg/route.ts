import { NextRequest, NextResponse } from 'next/server'
import { resolveIdentity } from '@/lib/auth'
import {
  reserveCredit,
  commitReservation,
  refundReservation,
  InsufficientCredits,
} from '@/lib/credits'
import { corsHeaders, preflight } from '@/lib/cors'
import { jsonError } from '@/lib/errors'

const REPLICATE_API = 'https://api.replicate.com/v1'

export async function OPTIONS(req: NextRequest) {
  return preflight(req)
}

async function uploadToReplicate(base64DataUri: string, token: string): Promise<string> {
  const match = base64DataUri.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('Invalid base64 data URI format')

  const mimeType = match[1]
  const base64Data = match[2]
  const buffer = Buffer.from(base64Data, 'base64')

  const ext = mimeType.split('/')[1] ?? 'png'
  const filename = `upload.${ext}`

  const formData = new FormData()
  const blob = new Blob([buffer], { type: mimeType })
  formData.append('content', blob, filename)

  const res = await fetch(`${REPLICATE_API}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })

  const body = await res.text()
  if (!res.ok) throw new Error(`Replicate Files API error ${res.status}: ${body}`)

  const file = JSON.parse(body)
  const url = file.urls?.get
  if (!url) throw new Error(`No URL in Files API response: ${body}`)
  return url
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get('origin'))
  const identity = await resolveIdentity(req)
  if (!identity) return jsonError(req, 401, 'auth_required')

  let reservation: { reservationId: string; balanceAfter: number }
  try {
    reservation = await reserveCredit(identity.userId, 'remove_bg')
  } catch (e) {
    if (e instanceof InsufficientCredits) {
      return jsonError(req, 402, 'insufficient_credits', { balance: e.balance })
    }
    throw e
  }

  try {
    const { image } = await req.json()
    if (!image) {
      await refundReservation(reservation.reservationId)
      return NextResponse.json({ error: 'image is required' }, { status: 400, headers: cors })
    }

    const token = process.env.REPLICATE_API_TOKEN
    if (!token) {
      await refundReservation(reservation.reservationId)
      return NextResponse.json(
        { error: 'Server misconfigured' },
        { status: 500, headers: cors }
      )
    }

    let imageUrl: string
    if (image.startsWith('data:')) {
      imageUrl = await uploadToReplicate(image, token)
    } else {
      imageUrl = image
    }

    const res = await fetch(`${REPLICATE_API}/models/bria/remove-background/predictions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'respond-async',
      },
      body: JSON.stringify({ input: { image: imageUrl } }),
    })

    const body = await res.text()
    if (!res.ok) {
      console.error('[remove-bg] Replicate API error:', res.status, body)
      await refundReservation(reservation.reservationId)
      return NextResponse.json(
        { error: `replicate_error_${res.status}`, refunded: true },
        { status: 502, headers: cors }
      )
    }

    const prediction = JSON.parse(body)
    await commitReservation(reservation.reservationId, prediction.id)
    return NextResponse.json(
      { id: prediction.id, status: prediction.status, balance: reservation.balanceAfter },
      { headers: cors }
    )
  } catch (err) {
    console.error('[remove-bg] Unexpected error:', String(err))
    await refundReservation(reservation.reservationId)
    return NextResponse.json(
      { error: 'remove_bg_failed', refunded: true },
      { status: 500, headers: cors }
    )
  }
}
