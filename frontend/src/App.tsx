import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchTenders } from './api/tenders'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import AuditLog from './pages/AuditLog'
import SobreA from './pages/SobreA'
import SobreC from './pages/SobreC'
import Spinner from './components/Spinner'
import type { EvaluationResults, ScoreMap, SobreAState, TenderEvalState } from './types'

export default function App() {
  const { data: tenders, isLoading, error } = useQuery({
    queryKey: ['tenders'],
    queryFn: fetchTenders,
  })

  const [selectedTenderId, setSelectedTenderId] = useState<string>('')

  // Lifted eval state: one entry per tender so switching tenders doesn't
  // lose scores already entered for a previous tender in the same session.
  const [evalState, setEvalState] = useState<Record<string, TenderEvalState>>({})

  const activeTenderId = selectedTenderId || tenders?.[0]?.tender_id || ''
  const activeTender   = tenders?.find(t => t.tender_id === activeTenderId)
  const activeEval     = evalState[activeTenderId] ?? {
    results: null,
    scores: {},
    sobreA: {},
    sobreALocked: false,
  }

  const handleEvalUpdate = (
    tenderId: string,
    results: EvaluationResults | null,
    scores: ScoreMap,
  ) => {
    setEvalState(prev => ({
      ...prev,
      [tenderId]: { ...prev[tenderId] ?? { sobreA: {}, sobreALocked: false }, results, scores },
    }))
  }

  // Accepts a functional updater so the stream handler never touches stale closure values.
  // The updater receives the latest results from inside setEvalState's own functional update.
  const handleResultsUpdate = (
    tenderId: string,
    updater: (prev: EvaluationResults | null) => EvaluationResults,
  ) => {
    setEvalState(prev => {
      const current = prev[tenderId] ?? { results: null, scores: {}, sobreA: {}, sobreALocked: false }
      return { ...prev, [tenderId]: { ...current, results: updater(current.results) } }
    })
  }

  const handleSobreAUpdate = (tenderId: string, sobreA: SobreAState, locked: boolean) => {
    setEvalState(prev => ({
      ...prev,
      [tenderId]: { ...prev[tenderId] ?? { results: null, scores: {} }, sobreA, sobreALocked: locked },
    }))
  }

  const handleTenderChange = (id: string) => {
    setSelectedTenderId(id)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Spinner label="Loading tenders…" />
      </div>
    )
  }

  if (error || !tenders || !activeTender) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-center px-6">
        <div>
          <p className="text-red-400 text-sm mb-2">
            Could not connect to API. Make sure the FastAPI server is running on port 8000.
          </p>
          <code className="text-xs text-slate-500">
            uvicorn api.main:app --reload --port 8000
          </code>
        </div>
      </div>
    )
  }

  return (
    <Layout
      tenders={tenders}
      selectedTenderId={activeTenderId}
      onTenderChange={handleTenderChange}
    >
      <Routes>
        <Route
          path="/sobre-a"
          element={
            <SobreA
              tender={activeTender}
              sobreA={activeEval.sobreA}
              sobreALocked={activeEval.sobreALocked}
              onUpdate={(s, l) => handleSobreAUpdate(activeTenderId, s, l)}
            />
          }
        />
        <Route
          path="/"
          element={
            <Dashboard
              tender={activeTender}
              evalState={activeEval}
              onEvalUpdate={handleEvalUpdate}
              onResultUpdate={(updater) => handleResultsUpdate(activeTenderId, updater)}
            />
          }
        />
        <Route path="/audit" element={<AuditLog tenders={tenders} />} />
        <Route
          path="/sobre-c"
          element={
            <SobreC
              tender={activeTender}
              evalState={activeEval}
            />
          }
        />
      </Routes>
    </Layout>
  )
}
