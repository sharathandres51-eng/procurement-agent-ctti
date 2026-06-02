import { baseURL } from './client'
import type { EvaluationProgressEvent } from '../types'

/**
 * Connects to POST /tenders/{id}/evaluate as a Server-Sent Events stream.
 * Calls onEvent for each completed cell, onDone when finished, onError on failure.
 *
 * Uses the same base URL as the axios client so it works in both
 * development (Vite proxy → localhost:8000) and production (Railway).
 *
 * Returns a cleanup function that aborts the stream.
 */
export function streamEvaluation(
  tenderId: string,
  language: string,
  onEvent: (event: EvaluationProgressEvent) => void,
  onDone: () => void,
  onError: (err: string) => void,
  supplierIds?: string[],
): () => void {
  const controller = new AbortController()

  // baseURL is either '/api' (dev proxy) or 'https://....railway.app' (prod)
  const url = `${baseURL}/tenders/${tenderId}/evaluate`

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language, supplier_ids: supplierIds }),
    signal: controller.signal,
  })
    .then(async res => {
      if (!res.ok) {
        onError(`Server error ${res.status}`)
        return
      }
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.slice(6))
              if (payload.done) {
                onDone()
              } else {
                onEvent(payload as EvaluationProgressEvent)
              }
            } catch {
              // malformed line - skip
            }
          }
        }
      }
    })
    .catch(err => {
      if (err.name !== 'AbortError') onError(String(err))
    })

  return () => controller.abort()
}
