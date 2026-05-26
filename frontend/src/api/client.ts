/**
 * api/client.ts
 * Thin axios wrapper. All requests go to /api which Vite proxies to
 * http://localhost:8000 in development.
 */
import axios from 'axios'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

export default client
