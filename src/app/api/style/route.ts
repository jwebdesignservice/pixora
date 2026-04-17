import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'
import { resolveIdentity } from '@/lib/auth'
import {
  reserveCredit,
  commitReservation,
  refundReservation,
  InsufficientCredits,
} from '@/lib/credits'
import { corsHeaders, preflight } from '@/lib/cors'
import { jsonError } from '@/lib/errors'

const FILTER_PROMPTS: Record<string, string> = {
  'oil-painting': 'Transform this image into a rich oil painting with visible brushstrokes and painterly texture',
  'watercolour': 'Transform this image into a soft watercolour painting with translucent washes and gentle edges',
  'pencil-sketch': 'Transform this image into a detailed pencil sketch drawing with fine line work and shading',
  'neon-glow': 'Transform this image with vibrant neon glow effects, electric colours and cyberpunk lighting',
  'cartoon': 'Transform this image into a bold cartoon illustration with clean outlines and flat colours',
  'vintage': 'Transform this image into a vintage retro photograph with muted tones, grain and aged patina',
  'cyberpunk': 'Transform this image into futuristic cyberpunk digital art with neon colours and dark atmosphere',
  'impressionist': 'Transform this image into an impressionist painting with loose expressive brushstrokes and soft light',
  'pop-art': 'Transform this image into bold pop art style with strong outlines, flat colours and halftone dots',
  'pixelated': 'Transform this image into pixel art 8-bit retro game style with clearly visible square pixels',
  'film-noir': 'Transform this image into black and white film noir style with high contrast and dramatic shadows',
  'anime': 'Transform this image into Japanese anime illustration style with clean lines and vibrant colours',
}

export async function OPTIONS(req: NextRequest) {
  return preflight(req)
}

export async function POST(req: NextRequest) {
  const cors = corsHeaders(req.headers.get('origin'))
  const identity = await resolveIdentity(req)
  if (!identity) return jsonError(req, 401, 'auth_required')

  let reservation: { reservationId: string; balanceAfter: number }
  try {
    reservation = await reserveCredit(identity.userId, 'style')
  } catch (e) {
    if (e instanceof InsufficientCredits) {
      return jsonError(req, 402, 'insufficient_credits', { balance: e.balance })
    }
    throw e
  }

  try {
    const { imageUrl, filter } = await req.json()
    if (!imageUrl || !filter) {
      await refundReservation(reservation.reservationId)
      return NextResponse.json(
        { error: 'imageUrl and filter are required' },
        { status: 400, headers: cors }
      )
    }

    const prompt = FILTER_PROMPTS[filter]
    if (!prompt) {
      await refundReservation(reservation.reservationId)
      return NextResponse.json(
        { error: `Unknown filter: ${filter}` },
        { status: 400, headers: cors }
      )
    }

    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
    const prediction = await replicate.predictions.create({
      model: 'black-forest-labs/flux-kontext-pro',
      input: { prompt, input_image: imageUrl, output_format: 'jpg' },
    })

    await commitReservation(reservation.reservationId, prediction.id)
    return NextResponse.json(
      { id: prediction.id, status: prediction.status, balance: reservation.balanceAfter },
      { headers: cors }
    )
  } catch (err) {
    console.error('[style] Error:', err)
    await refundReservation(reservation.reservationId)
    return NextResponse.json(
      { error: 'style_failed', refunded: true },
      { status: 500, headers: cors }
    )
  }
}
