import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchTenders } from './api/tenders'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import AuditLog from './pages/AuditLog'
import SobreC from './pages/SobreC'
import Spinner from './components/Spinner'
import type { EvaluationResults, ScoreMap, TenderEvalState } from './types'

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
  const activeEval     = evalState[activeTenderId] ?? { results: null, scores: {} }

  const handleEvalUpdate = (
    tenderId: string,
    results: EvaluationResults | null,
    scores: ScoreMap,
  ) => {
    setEvalState(prev => ({ ...prev, [tenderId]: { results, scores } }))
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
          path="/"
          element={
            <Dashboard
              tender={activeTender}
              evalState={activeEval}
              onEvalUpdate={handleEvalUpdate}
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
