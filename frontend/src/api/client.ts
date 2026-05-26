/**
 * api/client.ts
 * -------------
 * Axios instance with environment-aware base URL.
 *
 * Development  →  baseURL = '/api'  (Vite proxies to localhost:8000)
 * Production   →  baseURL = VITE_API_URL  (Railway public URL)
 *
 * Set VITE_API_URL in the Vercel dashboard:
 *   VITE_API_URL=https://your-project.railway.app
 */
import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL ?? '/api'

const client = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
})

export default client
export { baseURL }
