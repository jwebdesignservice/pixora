import { NextResponse } from 'next/server'

const ALLOWED = (process.env.ALLOWED_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean)

export function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED.includes(origin) ? origin : ALLOWED[0] ?? '*'
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Pixora-Device',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function preflight(req: Request): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}
