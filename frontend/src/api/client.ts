/**
 * api/client.ts
 * -------------
 * Axios instance with environment-aware base URL.
 *
 * Resolution order:
 *   1. VITE_API_URL  - if set at build time (Vercel env var), always wins
 *   2. Production build with no env var → the hardcoded Railway backend
 *   3. Development → '/api' so Vite's dev proxy forwards to localhost:8000
 *
 * The Railway URL is hardcoded as a production fallback so the deployed app
 * works even if VITE_API_URL is not picked up by the Vercel build.
 */
import axios from 'axios'

// Production backend (Railway). Update here if the Railway domain changes.
const RAILWAY_URL = 'https://procurement-agent-ctti-production.up.railway.app'

const resolved =
  import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? RAILWAY_URL : '/api')

// Strip any trailing slash so `${baseURL}/tenders` never produces a double slash
// (matters for the SSE stream URL built by hand in api/evaluate.ts).
const baseURL = resolved.replace(/\/+$/, '')

const client = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
})

export default client
export { baseURL }
