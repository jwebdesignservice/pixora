import { Resend } from 'resend'

export async function sendMagicCode(to: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !from) throw new Error('resend_not_configured')

  const resend = new Resend(apiKey)
  const subject = 'Your Pixora sign-in code'
  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px;color:#1a1a1a;">
      <h1 style="font-size:20px;margin:0 0 16px;">Your Pixora code</h1>
      <p style="margin:0 0 24px;color:#555;">Enter this code in the sign-in prompt. It expires in 10 minutes.</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:6px;background:#FFF5EE;color:#FF5C35;padding:16px 24px;border-radius:12px;text-align:center;">${code}</div>
      <p style="margin:24px 0 0;color:#888;font-size:13px;">If you didn't request this, ignore this email.</p>
    </div>
  `
  await resend.emails.send({ from, to, subject, html })
}
