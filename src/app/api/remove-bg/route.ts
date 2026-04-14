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

    // Create prediction and return immediately — client polls /api/remove-bg/[id]
    const prediction = await replicate.predictions.create({
      version: 'fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec05c17',
      input: { image },
    })

    return NextResponse.json(
      { id: prediction.id, status: prediction.status },
      { headers: CORS_HEADERS }
    )
  } catch (err) {
    console.error('[remove-bg] Error:', err)
    return NextResponse.json(
      { error: 'Failed to start background removal' },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
