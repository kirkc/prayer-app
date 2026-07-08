import { NextRequest } from 'next/server'

// Resolve the public base URL for links we email to users (invites, password
// resets). These must point at the deployed app, never at whatever origin the
// admin happened to send the request from — an admin testing on localhost was
// baking `http://localhost:3000` into live invite links.
//
// Resolution order:
//   1. NEXT_PUBLIC_SITE_URL — explicit override, wins everywhere.
//   2. VERCEL_PROJECT_PRODUCTION_URL — the stable production domain Vercel
//      injects automatically (unchanged across deploys, set on previews too).
//   3. The request origin — local dev fallback only.
export function getSiteUrl(req: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/+$/, '')

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (vercel) return `https://${vercel}`

  return req.nextUrl.origin
}
