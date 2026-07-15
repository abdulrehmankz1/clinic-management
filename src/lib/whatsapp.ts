// WhatsApp deep links (v3 spec §6.2). Zero-API reminders: the receptionist clicks
// a wa.me link and WhatsApp opens with the message prefilled. Pure helpers — safe
// to use on either side of the server/client boundary.

/**
 * Calling code per tenant currency. Patient phones are stored loosely normalised
 * (digits, optional leading +); local numbers ("03xx…") need a country code for
 * wa.me. The currency list is curated per launch market, so it doubles as an
 * honest, documented default — a `+`-prefixed number always wins over this guess.
 */
const CALLING_CODES: Record<string, string> = {
  PKR: '92',
  INR: '91',
  AED: '971',
  SAR: '966',
  GBP: '44',
  USD: '1',
}

/** International digits for wa.me (no +), or null when the phone is unusable. */
export function toWaDigits(phone: string | null | undefined, currency?: string | null): string | null {
  if (!phone) return null
  const trimmed = phone.trim()
  const digits = trimmed.replace(/[^0-9]/g, '')
  if (digits.length < 8) return null

  if (trimmed.startsWith('+')) return digits
  if (digits.startsWith('00')) return digits.slice(2)
  if (digits.startsWith('0')) {
    const code = currency ? CALLING_CODES[currency] : undefined
    return code ? `${code}${digits.slice(1)}` : null
  }
  return digits // already international (e.g. "923001234567")
}

/** Prefilled wa.me reminder link, or null when the phone can't be dialled. */
export function waReminderLink({
  phone,
  currency,
  doctorName,
  clinicName,
  dateLabel,
  timeLabel,
}: {
  phone: string | null | undefined
  currency?: string | null
  doctorName: string
  clinicName: string
  dateLabel: string
  timeLabel: string
}): string | null {
  const digits = toWaDigits(phone, currency)
  if (!digits) return null
  const text = `Reminder: your appointment with ${doctorName} at ${clinicName} is on ${dateLabel} at ${timeLabel}.`
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}
