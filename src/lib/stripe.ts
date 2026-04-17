import Stripe from 'stripe'

// Use the SDK's pinned apiVersion — avoids needing to track exact semver-compat strings.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '')

export function priceAllowlist(): Record<string, number> {
  const map: Record<string, number> = {}
  const p50 = process.env.STRIPE_PRICE_50
  const p200 = process.env.STRIPE_PRICE_200
  const p600 = process.env.STRIPE_PRICE_600
  if (p50) map[p50] = 50
  if (p200) map[p200] = 200
  if (p600) map[p600] = 600
  return map
}

export function creditsForPriceId(priceId: string): number | null {
  return priceAllowlist()[priceId] ?? null
}
