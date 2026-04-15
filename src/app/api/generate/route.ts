import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'

// Style modifiers — used for both text-to-image and img2img style transfer
const STYLE_SUFFIXES: Record<string, string> = {
  'oil':         'in the style of a rich oil painting with visible brushstrokes and painterly texture',
  'watercolour': 'in the style of a soft watercolour painting with translucent washes',
  'sketch':      'as a detailed pencil sketch drawing with fine line work and shading',
  'neon':        'with vibrant neon glow effects, electric colours and cyberpunk lighting',
  'cartoon':     'as a bold cartoon illustration with clean outlines and flat colours',
  'vintage':     'as a vintage retro photograph with muted tones and aged grain',
  'pixel':       'as pixel art 8-bit retro game style with clearly visible square pixels',
  'anime':       'as Japanese anime illustration with clean lines and vibrant colours',
  'minimal':     'as a clean minimalist design with simple shapes and muted palette',
  'surreal':     'as surrealist art with dreamlike distortions and unexpected compositions',
  'portrait':    'as a professional studio portrait with soft lighting and refined tones',
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
    const { prompt, filter, aspectRatio, image } = await req.json()

    // img2img mode: image + filter required, prompt optional
    // text-to-image mode: prompt required
    if (!prompt && !image) {
      return NextResponse.json(
        { error: 'prompt or image is required' },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const validRatios = ['1:1', '2:3', '3:2', '4:5', '5:4', '3:4', '4:3', '16:9', '9:16']
    const ratio = validRatios.includes(aspectRatio) ? aspectRatio : '1:1'

    const styleSuffix = filter && STYLE_SUFFIXES[filter] ? `, ${STYLE_SUFFIXES[filter]}` : ''

    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN })

    // img2img style transfer — send the image + style prompt to flux-dev
    if (image) {
      const stylePrompt = prompt
        ? `${prompt}${styleSuffix}, high quality, print ready, 4k`
        : `Transform this image${styleSuffix}, high quality, print ready, 4k`

      const prediction = await replicate.predictions.create({
        model: 'black-forest-labs/flux-dev',
        input: {
          prompt: stylePrompt,
          image,
          prompt_strength: 0.65,
          num_outputs: 1,
          output_format: 'jpg',
          output_quality: 90,
          guidance: 3.5,
          num_inference_steps: 28,
        },
      })

      return NextResponse.json(
        { id: prediction.id, status: prediction.status },
        { headers: CORS_HEADERS }
      )
    }

    // Text-to-image generation
    const fullPrompt = `${prompt}${styleSuffix}, high quality, print ready, 4k`

    const prediction = await replicate.predictions.create({
      model: 'black-forest-labs/flux-dev',
      input: {
        prompt: fullPrompt,
        num_outputs: 3,
        output_format: 'jpg',
        output_quality: 90,
        aspect_ratio: ratio,
        guidance: 3.5,
        num_inference_steps: 28,
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
