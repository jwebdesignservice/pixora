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

async function uploadToReplicate(base64DataUri: string, token: string): Promise<string> {
  // Parse data URI: "data:<mime>;base64,<data>"
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
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  })

  const body = await res.text()
  console.log('[remove-bg] Files API response:', res.status, body)

  if (!res.ok) {
    throw new Error(`Replicate Files API error ${res.status}: ${body}`)
  }

  const file = JSON.parse(body)
  const url = file.urls?.get
  if (!url) throw new Error(`No URL in Files API response: ${body}`)
  return url
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

    // Replicate models require an HTTPS URL — they don't accept base64 data URIs.
    // Upload via the Files API first to get a hosted URL.
    let imageUrl: string
    if (image.startsWith('data:')) {
      console.log('[remove-bg] Uploading base64 image to Replicate Files API...')
      imageUrl = await uploadToReplicate(image, token)
      console.log('[remove-bg] Uploaded, got URL:', imageUrl)
    } else {
      // Already an HTTPS URL
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
