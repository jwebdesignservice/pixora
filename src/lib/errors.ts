import { NextResponse } from 'next/server'
import { corsHeaders } from './cors'

export function jsonError(
  req: Request,
  status: number,
  error: string,
  extra: Record<string, unknown> = {}
) {
  return NextResponse.json(
    { error, ...extra },
    { status, headers: corsHeaders(req.headers.get('origin')) }
  )
}

export function jsonOk(req: Request, data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: corsHeaders(req.headers.get('origin')),
  })
}
