import { NextRequest, NextResponse } from 'next/server'
import Replicate from 'replicate'

const REPLICATE_API = 'https://api.replicate.com/v1'

// Style modifiers — used for text-to-image generation
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

// Style prompts for img2img (flux-kontext-pro) — these instruct the model
// to change ONLY the artistic style while keeping all content identical
const STYLE_TRANSFER_PROMPTS: Record<string, string> = {
  'oil':         'Apply an oil painting style to this image. Keep every detail, shape, object, and composition exactly the same. Only change the rendering to look like a traditional oil painting with visible brushstrokes and rich painterly texture.',
  'watercolour': 'Apply a watercolour painting style to this image. Keep every detail, shape, object, and composition exactly the same. Only change the rendering to look like a soft watercolour with translucent washes and gentle colour bleeding.',
  'sketch':      'Convert this image to a detailed pencil sketch. Keep every detail, shape, object, and composition exactly the same. Only change the rendering to fine pencil line work with graphite shading.',
  'neon':        'Apply a neon glow effect to this image. Keep every detail, shape, object, and composition exactly the same. Only add vibrant neon lighting, electric colours, and glowing edges.',
  'cartoon':     'Convert this image to a cartoon illustration style. Keep every detail, shape, object, and composition exactly the same. Only change the rendering to bold outlines and flat cel-shaded colours.',
  'vintage':     'Apply a vintage retro photograph look to this image. Keep every detail, shape, object, and composition exactly the same. Only add muted faded tones, subtle grain, and an aged patina effect.',
  'pixel':       'Convert this image to pixel art style. Keep every detail, shape, object, and composition exactly the same. Only change the rendering to clearly visible square pixels in an 8-bit retro game aesthetic.',
  'anime':       'Convert this image to Japanese anime illustration style. Keep every detail, shape, object, and composition exactly the same. Only change the rendering to clean anime-style lines and vibrant cel-shaded colours.',
  'minimal':     'Apply a clean minimalist style to this image. Keep every detail, shape, object, and composition exactly the same. Only simplify the rendering with cleaner shapes and a muted palette.',
  'surreal':     'Apply a surrealist art style to this image. Keep every detail, shape, object, and composition exactly the same. Only change the colour palette and rendering to have a dreamlike surrealist quality.',
  'portrait':    'Apply a professional studio portrait style to this image. Keep every detail, shape, object, and composition exactly the same. Only enhance the rendering with soft studio lighting and refined tones.',
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

async function uploadToReplicate(base64DataUri: string, token: string): Promise<string> {
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
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Replicate Files API error ${res.status}: ${body}`)
  }

  const file = await res.json()
  const url = file.urls?.get
  if (!url) throw new Error('No URL in Files API response')
  return url
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

    const token = process.env.REPLICATE_API_TOKEN!
    const replicate = new Replicate({ auth: token })

    // img2img mode — use flux-kontext-pro for editing/style transfer
    if (image) {
      // Determine the prompt:
      // - If user provided a text prompt (e.g. "add a wooly hat"), use it directly for editing
      // - If a style filter is selected (from step 3), use the style transfer prompt
      // - If both, combine them
      let editPrompt: string
      if (filter && STYLE_TRANSFER_PROMPTS[filter]) {
        editPrompt = STYLE_TRANSFER_PROMPTS[filter]
      } else if (prompt) {
        editPrompt = prompt
      } else {
        editPrompt = 'Enhance this image while keeping all details identical.'
      }

      // flux-kontext-pro needs an HTTPS URL, not base64
      let imageUrl: string
      if (image.startsWith('data:')) {
        imageUrl = await uploadToReplicate(image, token)
      } else {
        imageUrl = image
      }

      const prediction = await replicate.predictions.create({
        model: 'black-forest-labs/flux-kontext-pro',
        input: {
          prompt: editPrompt,
          input_image: imageUrl,
          output_format: 'jpg',
        },
      })

      return NextResponse.json(
        { id: prediction.id, status: prediction.status },
        { headers: CORS_HEADERS }
      )
    }

    // Text-to-image generation
    const styleSuffix = filter && STYLE_SUFFIXES[filter] ? `, ${STYLE_SUFFIXES[filter]}` : ''
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
