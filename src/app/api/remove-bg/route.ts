import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  try {
    const { image } = await req.json()

    if (!image) {
      return NextResponse.json(
        { error: 'image is required' },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

    // Replicate's predictions.create() doesn't accept base64 data URIs directly —
    // convert to a Blob so the SDK uploads it to Replicate's CDN first.
    let imageInput: Blob | string = image
    if (typeof image === 'string' && image.startsWith('data:')) {
      const commaIdx = image.indexOf(',')
      const header   = image.slice(0, commaIdx)          // e.g. "data:image/jpeg;base64"
      const b64      = image.slice(commaIdx + 1)
      const mimeMatch = header.match(/data:([^;]+)/)
      const mimeType  = mimeMatch ? mimeMatch[1] : 'image/jpeg'
      const buffer   = Buffer.from(b64, 'base64')
      imageInput = new Blob([buffer], { type: mimeType })
    }

    // Create prediction and return immediately — client polls /api/remove-bg/[id]
    const prediction = await replicate.predictions.create({
      model: 'lucataco/remove-bg',
      input: { image: imageInput },
    })

    return NextResponse.json(
      { id: prediction.id, status: prediction.status },
      { headers: CORS_HEADERS }
    )
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; detail?: unknown }
    console.error('[remove-bg] status:', e?.status)
    console.error('[remove-bg] message:', e?.message)
    console.error('[remove-bg] detail:', JSON.stringify(e?.detail))
    return NextResponse.json(
      { error: 'Failed to start background removal' },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
