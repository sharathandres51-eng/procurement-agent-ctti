/**
 * middleware.ts (repo root)
 * -------------------------
 * Vercel Edge Middleware — HTTP Basic Auth password gate.
 *
 * Vercel detects middleware at the ROOT of the deployment, which is the
 * project's configured "Root Directory". This copy covers the case where the
 * Root Directory is the repo root; an identical copy lives in frontend/ for
 * the case where the Root Directory is `frontend`. Only the one at the actual
 * deployment root activates — the other is an inert source file.
 *
 * Set BASIC_AUTH_PASSWORD in the Vercel dashboard. Any username works; only
 * the password is checked. If BASIC_AUTH_PASSWORD is not set, the gate is
 * disabled (requests pass through) so the site is never accidentally locked.
 *
 * Dependency-free on purpose: importing '@vercel/edge' would fail to resolve
 * at the repo root (its node_modules lives in frontend/). The "continue"
 * response below is exactly what @vercel/edge's next() returns.
 */

export const config = {
  // Match every path except static assets and the favicon image.
  matcher: ['/((?!assets/|favicon\\.ico|icons\\.svg|ctti_logo\\.jpeg).*)'],
}

// Tell Vercel to continue to the static asset / origin (equivalent to next()).
function proceed(): Response {
  return new Response(null, { headers: { 'x-middleware-next': '1' } })
}

export default function middleware(request: Request): Response {
  // Diagnostic probe: hitting /__authcheck always returns a distinctive 401
  // IFF this middleware is actually executing. Used to tell "middleware not
  // detected" apart from "middleware runs but BASIC_AUTH_PASSWORD unset".
  if (new URL(request.url).pathname === '/__authcheck') {
    // Reports only whether the var is PRESENT at runtime — never its value.
    const state = process.env.BASIC_AUTH_PASSWORD ? 'configured' : 'unset'
    return new Response(`gate-active:${state}`, { status: 401 })
  }

  const expected = process.env.BASIC_AUTH_PASSWORD

  // No password configured → gate disabled, let everyone through.
  if (!expected) return proceed()

  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Basic ')) {
    try {
      const decoded  = atob(authHeader.slice(6)) // "user:password"
      const password = decoded.slice(decoded.indexOf(':') + 1)
      if (password === expected) return proceed()
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
