/**
 * frontend/middleware.ts
 * ----------------------
 * Vercel Edge Middleware — HTTP Basic Auth password gate.
 *
 * Vercel detects middleware at the ROOT of the deployment (the project's
 * configured "Root Directory"). This copy covers Root Directory = frontend;
 * an identical copy lives at the repo root for Root Directory = repo root.
 * Only the one at the actual deployment root activates — the other is inert.
 *
 * The password is checked against a hardcoded SHA-256 hash rather than an env
 * var: this project's Vercel env vars were not reaching the deployment, and a
 * hash is safe to commit (it cannot be reversed to recover the password).
 * To change the password, replace PASSWORD_SHA256 with the new hash:
 *   printf '%s' 'newpassword' | shasum -a 256
 *
 * Any username works; only the password is checked.
 */

// SHA-256 of the access password.
const PASSWORD_SHA256 =
  '1b19ed4901acbf58c58d980e88cb15de6cbca5f91715b858429a689799d862e8'

export const config = {
  // Match every path except static assets and the favicon image.
  matcher: ['/((?!assets/|favicon\\.ico|icons\\.svg|ctti_logo\\.jpeg).*)'],
}

// Continue to the static asset / origin (equivalent to @vercel/edge's next()).
function proceed(): Response {
  return new Response(null, { headers: { 'x-middleware-next': '1' } })
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function unauthorized(): Response {
  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="CTTI Procurement Workbench"' },
  })
}

export default async function middleware(request: Request): Promise<Response> {
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Basic ')) {
    try {
      const decoded  = atob(authHeader.slice(6)) // "user:password"
      const password = decoded.slice(decoded.indexOf(':') + 1)
      if ((await sha256Hex(password)) === PASSWORD_SHA256) return proceed()
    } catch {
      // malformed base64 — fall through to 401
    }
  }
  return unauthorized()
}
