/**
 * frontend/middleware.ts
 * ----------------------
 * Vercel Edge Middleware — HTTP Basic Auth password gate.
 *
 * Set the environment variable BASIC_AUTH_PASSWORD in the Vercel dashboard.
 * Any request without the correct password gets a 401 + browser login prompt.
 * Static assets (JS/CSS/images) are excluded so the browser can load them
 * after auth is granted.
 *
 * This runs at the edge (before the page is served), so the source code and
 * API calls are never exposed to unauthenticated visitors.
 */

import { next } from '@vercel/edge'

export const config = {
  // Match every path except static assets and the favicon
  matcher: ['/((?!assets/|favicon\\.ico|icons\\.svg).*)'],
}

export default function middleware(request: Request): Response {
  const authHeader = request.headers.get('authorization')

  if (authHeader?.startsWith('Basic ')) {
    try {
      const base64   = authHeader.slice(6)
      const decoded  = atob(base64)              // "user:password"
      const colonIdx = decoded.indexOf(':')
      const password = decoded.slice(colonIdx + 1)

      if (password === process.env.BASIC_AUTH_PASSWORD) {
        return next()
      }
    } catch {
      // malformed base64 — fall through to 401
    }
  }

  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="CTTI Procurement Workbench"',
    },
  })
}
