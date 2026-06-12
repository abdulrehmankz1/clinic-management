import React from 'react'
import { figtree, bricolage } from '@/lib/fonts'
import './globals.css'

export const metadata = {
  title: 'Matab — clinic management, simplified',
  description:
    'Multi-tenant clinic management for small clinics — appointments, patients and staff in one calm dashboard.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${bricolage.variable}`}>
      <body>{children}</body>
    </html>
  )
}
