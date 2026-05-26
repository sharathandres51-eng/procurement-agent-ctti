import { useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchTenders } from './api/tenders'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import AuditLog from './pages/AuditLog'
import SobreC from './pages/SobreC'
import Spinner from './components/Spinner'

export default function App() {
  const { data: tenders, isLoading, error } = useQuery({
    queryKey: ['tenders'],
    queryFn: fetchTenders,
  })

  const [selectedTenderId, setSelectedTenderId] = useState<string>('')

  // Once tenders load, set the default selection
  const activeTenderId = selectedTenderId || tenders?.[0]?.tender_id || ''
  const activeTender = tenders?.find(t => t.tender_id === activeTenderId)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Spinner label="Loading tenders…" />
      </div>
    )
  }

  if (error || !tenders || !activeTender) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-red-400 text-sm">
          Could not connect to API. Make sure the FastAPI server is running on port 8000.
          <br />
          <code className="text-xs mt-2 block">uvicorn api.main:app --reload --port 8000</code>
        </div>
      </div>
    )
  }

  return (
    <Layout
      tenders={tenders}
      selectedTenderId={activeTenderId}
      onTenderChange={id => setSelectedTenderId(id)}
    >
      <Routes>
        <Route path="/" element={<Dashboard tender={activeTender} />} />
        <Route path="/audit" element={<AuditLog />} />
        <Route path="/sobre-c" element={<SobreC tender={activeTender} />} />
      </Routes>
    </Layout>
  )
}
