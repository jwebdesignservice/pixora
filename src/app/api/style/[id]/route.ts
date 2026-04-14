import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })
    const prediction = await replicate.predictions.get(id)

    const outputUrl =
      prediction.status === 'succeeded' && Array.isArray(prediction.output)
        ? (prediction.output[0] as string)
        : prediction.status === 'succeeded'
        ? (prediction.output as string)
        : null

    return NextResponse.json(
      { status: prediction.status, outputUrl },
      { headers: CORS_HEADERS }
    )
  } catch (err) {
    console.error('[style/[id]] Error:', err)
    return NextResponse.json(
      { error: 'Failed to check prediction' },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
