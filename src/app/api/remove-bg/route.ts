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

    // lucataco/remove-bg requires an HTTPS URL — it does not accept base64.
    // Upload the image to the Replicate Files API to get a hosted URL first.
    let imageUrl: string = image

    if (typeof image === 'string' && image.startsWith('data:')) {
      const commaIdx = image.indexOf(',')
      const b64 = image.slice(commaIdx + 1)
      const mimeMatch = image.match(/data:([^;]+)/)
      const mimeType = (mimeMatch ? mimeMatch[1] : 'image/jpeg') as `${string}/${string}`
      const bytes = Uint8Array.from(Buffer.from(b64, 'base64'))
      const blob = new Blob([bytes], { type: mimeType })

      const fileResponse = await replicate.files.create(blob, {
        filename: `upload.${mimeType.split('/')[1] ?? 'jpg'}`,
      })
      imageUrl = fileResponse.urls.get
    }

    const prediction = await replicate.predictions.create({
      model: 'lucataco/remove-bg',
      input: { image: imageUrl },
    })

    return NextResponse.json(
      { id: prediction.id, status: prediction.status },
      { headers: CORS_HEADERS }
    )
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string; detail?: unknown; stack?: string }
    console.error('[remove-bg] FULL ERROR:', JSON.stringify({
      status: e?.status,
      message: e?.message,
      detail: e?.detail,
      stack: e?.stack,
      raw: String(err),
    }))
    return NextResponse.json(
      { error: 'Failed to start background removal' },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
