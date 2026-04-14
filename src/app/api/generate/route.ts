import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'

// Style modifiers appended to the user's prompt
const STYLE_SUFFIXES: Record<string, string> = {
  'oil-painting':  'in the style of a rich oil painting with visible brushstrokes and painterly texture',
  'watercolour':   'in the style of a soft watercolour painting with translucent washes',
  'pencil-sketch': 'as a detailed pencil sketch drawing with fine line work and shading',
  'neon-glow':     'with vibrant neon glow effects, electric colours and cyberpunk lighting',
  'cartoon':       'as a bold cartoon illustration with clean outlines and flat colours',
  'vintage':       'as a vintage retro photograph with muted tones and aged grain',
  'cyberpunk':     'as futuristic cyberpunk digital art with neon colours and dark atmosphere',
  'impressionist': 'in the style of an impressionist painting with loose expressive brushstrokes',
  'pop-art':       'as bold pop art with strong outlines, flat colours and halftone dots',
  'pixelated':     'as pixel art 8-bit retro game style with clearly visible square pixels',
  'film-noir':     'as black and white film noir with high contrast and dramatic shadows',
  'anime':         'as Japanese anime illustration with clean lines and vibrant colours',
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
    const { prompt, filter, mood } = await req.json()

    if (!prompt) {
      return NextResponse.json(
        { error: 'prompt is required' },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const styleSuffix = filter && STYLE_SUFFIXES[filter] ? `, ${STYLE_SUFFIXES[filter]}` : ''
    const moodPrefix  = mood ? `${mood} mood, ` : ''
    const fullPrompt  = `${moodPrefix}${prompt}${styleSuffix}, high quality, print ready, 4k`

    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

    const prediction = await replicate.predictions.create({
      model: 'black-forest-labs/flux-schnell',
      input: {
        prompt: fullPrompt,
        num_outputs: 1,
        output_format: 'jpg',
        output_quality: 90,
        aspect_ratio: '1:1',
      },
    })

    return NextResponse.json(
      { id: prediction.id, status: prediction.status },
      { headers: CORS_HEADERS }
    )
  } catch (err) {
    console.error('[generate] Error:', err)
    return NextResponse.json(
      { error: 'Failed to start generation' },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
