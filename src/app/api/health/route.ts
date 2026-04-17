import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/db/client'
import { corsHeaders } from '@/lib/cors'

export async function GET(req: NextRequest) {
  try {
    await pool.query('SELECT 1')
    return NextResponse.json({ ok: true }, { headers: corsHeaders(req.headers.get('origin')) })
  } catch {
    return NextResponse.json(
      { ok: false },
      { status: 503, headers: corsHeaders(req.headers.get('origin')) }
    )
  }
}
