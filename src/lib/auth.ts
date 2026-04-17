import { SignJWT, jwtVerify } from 'jose'
import { createHash, randomBytes, randomInt } from 'crypto'
import { ensureUser } from './credits'

const SECRET = new TextEncoder().encode(process.env.PIXORA_JWT_SECRET ?? '')
const ISSUER = 'pixora-api'

export interface Identity {
  userId: string
  email: string
  kind: 'anon' | 'real'
}

export async function signSession(userId: string, email: string): Promise<string> {
  return new SignJWT({ sub: userId, email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(SECRET)
}

export async function verifySession(token: string): Promise<{ userId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, { issuer: ISSUER })
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') return null
    return { userId: payload.sub, email: payload.email }
  } catch {
    return null
  }
}

// Resolve identity from a request: Authorization wins; else X-Pixora-Device creates anon user.
export async function resolveIdentity(req: Request): Promise<Identity | null> {
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const v = await verifySession(auth.slice(7))
    if (v) return { userId: v.userId, email: v.email, kind: 'real' }
  }
  const device = req.headers.get('x-pixora-device')
  if (device && /^[a-z0-9-]{8,64}$/i.test(device)) {
    const email = `anon:${device}`
    const { id } = await ensureUser(email)
    return { userId: id, email, kind: 'anon' }
  }
  return null
}

export function generateMagicCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

export function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

export function newJti(): string {
  return randomBytes(16).toString('hex')
}
