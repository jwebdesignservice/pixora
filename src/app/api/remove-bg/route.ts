import { NextRequest, NextResponse } from 'next/server'

const REPLICATE_API = 'https://api.replicate.com/v1'

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

    const token = process.env.REPLICATE_API_TOKEN
    if (!token) {
      console.error('[remove-bg] REPLICATE_API_TOKEN is not set')
      return NextResponse.json(
        { error: 'Server misconfigured' },
        { status: 500, headers: CORS_HEADERS }
      )
    }

    // Call Replicate API directly (no SDK) so we get full error visibility.
    // Pass the base64 data URI straight through — the Replicate API handles
    // data URIs for image inputs on models that accept URI type.
    const res = await fetch(`${REPLICATE_API}/models/bria/remove-background/predictions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'respond-async',
      },
      body: JSON.stringify({ input: { image } }),
    })

    const body = await res.text()
    console.log('[remove-bg] Replicate response:', res.status, body)

    if (!res.ok) {
      console.error('[remove-bg] Replicate API error:', res.status, body)
      return NextResponse.json(
        { error: `Replicate error ${res.status}` },
        { status: 502, headers: CORS_HEADERS }
      )
    }

    const prediction = JSON.parse(body)
    return NextResponse.json(
      { id: prediction.id, status: prediction.status },
      { headers: CORS_HEADERS }
    )
  } catch (err: unknown) {
    console.error('[remove-bg] Unexpected error:', String(err))
    return NextResponse.json(
      { error: 'Failed to start background removal' },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
