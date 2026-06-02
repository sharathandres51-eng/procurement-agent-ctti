/**
 * middleware.ts (repo root)
 * -------------------------
 * Vercel Edge Middleware - password gate with a custom login page.
 *
 * Unlike HTTP Basic Auth (which forces the browser's username+password
 * dialog), this serves a branded password-only login form. On submit, the
 * password is validated against a committed SHA-256 hash and, if correct, a
 * cookie holding the password is set so subsequent requests pass through.
 *
 * Security: the hash is safe to commit (not reversible). The cookie holds the
 * plaintext password (HttpOnly, Secure) - equivalent to how Basic Auth keeps
 * credentials in the browser. A repo reader only has the hash, so cannot forge
 * a valid cookie.
 *
 * Vercel detects middleware at the deployment root (the "Root Directory"
 * setting). An identical copy lives in frontend/ so it works either way.
 *
 * To change the password, replace PASSWORD_SHA256 with the new hash:
 *   printf '%s' 'newpassword' | shasum -a 256
 */

// SHA-256 of the access password.
const PASSWORD_SHA256 =
  '1b19ed4901acbf58c58d980e88cb15de6cbca5f91715b858429a689799d862e8'

const COOKIE = 'ctti_pw'

export const config = {
  // Match every path except static assets and the favicon image.
  matcher: ['/((?!assets/|favicon\\.ico|icons\\.svg|ctti_logo\\.jpeg).*)'],
}

function proceed(): Response {
  return new Response(null, { headers: { 'x-middleware-next': '1' } })
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

function loginPage(error = ''): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CTTI Procurement Evaluation</title>
<link rel="icon" type="image/jpeg" href="/ctti_logo.jpeg">
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0;font-family:system-ui,-apple-system,sans-serif}
  .card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:40px 36px;width:320px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.4)}
  img{width:56px;height:56px;border-radius:12px;object-fit:cover;margin-bottom:16px}
  h1{font-size:15px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin:0 0 4px}
  p{font-size:12px;color:#94a3b8;margin:0 0 24px}
  input{width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:10px 12px;color:#e2e8f0;font-size:14px;outline:none}
  input:focus{border-color:#A81B0F}
  button{width:100%;margin-top:12px;background:#A81B0F;border:none;border-radius:8px;padding:10px;color:#fff;font-weight:600;font-size:14px;cursor:pointer}
  button:hover{background:#8A160C}
  .err{color:#f87171;font-size:12px;margin-top:12px;min-height:14px}
</style></head>
<body>
  <form class="card" method="POST" action="/__login">
    <img src="/ctti_logo.jpeg" alt="CTTI">
    <h1>CTTI Procurement</h1>
    <p>Enter the access password to continue</p>
    <input type="password" name="password" placeholder="Password" autofocus autocomplete="current-password">
    <button type="submit">Unlock</button>
    <div class="err">${error}</div>
  </form>
</body></html>`
  return new Response(html, {
    status: error ? 401 : 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url)

  // Handle login form submission.
  if (request.method === 'POST' && url.pathname === '/__login') {
    const form = await request.formData()
    const password = String(form.get('password') ?? '')
    if ((await sha256Hex(password)) === PASSWORD_SHA256) {
      return new Response(null, {
        status: 303,
        headers: {
          Location: '/',
          'Set-Cookie': `${COOKIE}=${encodeURIComponent(password)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
        },
      })
    }
    return loginPage('Incorrect password')
  }

  // Already authenticated via cookie?
  const cookie = readCookie(request, COOKIE)
  if (cookie && (await sha256Hex(cookie)) === PASSWORD_SHA256) {
    return proceed()
  }

  // Not authenticated - show the login page.
  return loginPage()
}
