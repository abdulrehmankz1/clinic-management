// Thin Resend wrapper (v3 spec §6.1). Email is OPTIONAL infrastructure: with no
// RESEND_API_KEY the app runs fine and senders report `skipped` — graceful
// degradation, never a crash. Callers decide what a skip means for them.

import { Resend } from 'resend'

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

export type SendEmailInput = { to: string; subject: string; html: string }
export type SendEmailResult = { ok: boolean; skipped?: boolean; error?: string }
export type SendEmail = (input: SendEmailInput) => Promise<SendEmailResult>

export const sendEmail: SendEmail = async ({ to, subject, html }) => {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, skipped: true }

  try {
    const resend = new Resend(key)
    const { error } = await resend.emails.send({
      // resend.dev sender works out of the box (delivers to the account owner);
      // a verified domain goes in EMAIL_FROM for production.
      from: process.env.EMAIL_FROM || 'matab <onboarding@resend.dev>',
      to,
      subject,
      html,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
