import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'

// Map Pixora filter names to Flux Kontext prompts
const FILTER_PROMPTS: Record<string, string> = {
  'oil-painting':   'Transform this image into a rich oil painting with visible brushstrokes and painterly texture',
  'watercolour':    'Transform this image into a soft watercolour painting with translucent washes and gentle edges',
  'pencil-sketch':  'Transform this image into a detailed pencil sketch drawing with fine line work and shading',
  'neon-glow':      'Transform this image with vibrant neon glow effects, electric colours and cyberpunk lighting',
  'cartoon':        'Transform this image into a bold cartoon illustration with clean outlines and flat colours',
  'vintage':        'Transform this image into a vintage retro photograph with muted tones, grain and aged patina',
  'cyberpunk':      'Transform this image into futuristic cyberpunk digital art with neon colours and dark atmosphere',
  'impressionist':  'Transform this image into an impressionist painting with loose expressive brushstrokes and soft light',
  'pop-art':        'Transform this image into bold pop art style with strong outlines, flat colours and halftone dots',
  'pixelated':      'Transform this image into pixel art 8-bit retro game style with clearly visible square pixels',
  'film-noir':      'Transform this image into black and white film noir style with high contrast and dramatic shadows',
  'anime':          'Transform this image into Japanese anime illustration style with clean lines and vibrant colours',
}

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
    const { imageUrl, filter } = await req.json()

    if (!imageUrl || !filter) {
      return NextResponse.json(
        { error: 'imageUrl and filter are required' },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const prompt = FILTER_PROMPTS[filter]
    if (!prompt) {
      return NextResponse.json(
        { error: `Unknown filter: ${filter}` },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

    // Create prediction without waiting for it to complete
    const prediction = await replicate.predictions.create({
      model: 'black-forest-labs/flux-kontext-pro',
      input: {
        prompt,
        input_image: imageUrl,
        output_format: 'jpg',
      },
    })

    return NextResponse.json(
      { id: prediction.id, status: prediction.status },
      { headers: CORS_HEADERS }
    )
  } catch (err) {
    console.error('[style] Error:', err)
    return NextResponse.json(
      { error: 'Failed to start generation' },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
