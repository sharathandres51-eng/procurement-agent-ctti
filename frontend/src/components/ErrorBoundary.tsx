/**
 * ErrorBoundary
 * -------------
 * Catches render-time exceptions anywhere in the component tree and shows a
 * readable fallback instead of unmounting React (which would leave only the
 * dark page background visible — a "blank screen").
 *
 * A common trigger in this app: a misconfigured API base URL. If VITE_API_URL
 * is not baked into the build, requests hit /api on the Vercel domain, the SPA
 * rewrite returns index.html, and code that expects JSON throws on the HTML
 * string. Without this boundary that throw produces a silent blank screen.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the full stack in the browser console for debugging.
    console.error('Uncaught render error:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-center px-6">
        <div className="max-w-lg">
          <p className="text-red-400 text-sm font-semibold mb-2">
            Something went wrong rendering the app.
          </p>
          <p className="text-slate-400 text-xs mb-4">
            This is often caused by the frontend being unable to reach the API.
            Confirm <code className="text-slate-300">VITE_API_URL</code> is set in
            Vercel (Production scope) and that a fresh build has run since.
          </p>
          <pre className="text-left text-[11px] text-slate-500 bg-slate-800/60 rounded-lg p-3 overflow-auto max-h-48">
            {this.state.error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2 rounded-lg transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
