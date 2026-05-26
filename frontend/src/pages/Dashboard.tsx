import { useState, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchPlan } from '../api/tenders'
import { streamEvaluation } from '../api/evaluate'
import { submitAuditEntry } from '../api/audit'
import PlanTable from '../components/PlanTable'
import EvidenceCard from '../components/EvidenceCard'
import ComparisonPanel from '../components/ComparisonPanel'
import Spinner from '../components/Spinner'
import SourceChunksPanel from '../components/SourceChunksPanel'
import type {
  TenderSummary,
  EvaluationResults,
  CriterionResult,
  ScoreMap,
  TenderEvalState,
} from '../types'

interface DashboardProps {
  tender: TenderSummary
  evalState: TenderEvalState
  onEvalUpdate: (tenderId: string, results: EvaluationResults | null, scores: ScoreMap) => void
}

export default function Dashboard({ tender, evalState, onEvalUpdate }: DashboardProps) {
  const { t, i18n } = useTranslation()

  const results = evalState.results
  const scores  = evalState.scores

  const setResults = (updater: ((prev: EvaluationResults | null) => EvaluationResults) | EvaluationResults | null) => {
    const next = typeof updater === 'function' ? updater(evalState.results) : updater
    onEvalUpdate(tender.tender_id, next, evalState.scores)
  }

  const setScores = (updater: ((prev: ScoreMap) => ScoreMap) | ScoreMap) => {
    const next = typeof updater === 'function' ? updater(evalState.scores) : updater
    onEvalUpdate(tender.tender_id, evalState.results, next)
  }

  const [running, setRunning] = useState(false)
  const [completedCells, setCompletedCells] = useState(0)
  const [currentCell, setCurrentCell] = useState('')
  const [evaluatorId, setEvaluatorId] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewSupIdx, setReviewSupIdx] = useState(0)
  const [reviewCritIdx, setReviewCritIdx] = useState(0)

  // ── Plan ────────────────────────────────────────────────────────────────────

  const { data: plan, isLoading: planLoading, error: planError } = useQuery({
    queryKey: ['plan', tender.tender_id],
    queryFn: () => fetchPlan(tender.tender_id),
  })

  // Total cells = suppliers × (flat criteria + sub-criteria cells)
  const totalCells = useMemo(() => {
    if (!plan) return 0
    const cellsPerSupplier = plan.criteria.reduce((sum, c) =>
      sum + (c.has_subcriteria ? c.subcriteria.length : 1), 0
    )
    return cellsPerSupplier * tender.suppliers.length
  }, [plan, tender.suppliers.length])

  const progressPct = totalCells > 0 ? Math.round((completedCells / totalCells) * 100) : 0

  // ── Score helpers ────────────────────────────────────────────────────────────
  // null = not yet scored (distinct from deliberately scoring 0)

  const setScore = (supplierId: string, criterionId: string, value: number, subId?: string) => {
    setScores(prev => {
      const updated = { ...prev }
      if (!updated[supplierId]) updated[supplierId] = {}
      if (subId) {
        const existing = updated[supplierId][criterionId] as Record<string, number | null> | undefined
        updated[supplierId][criterionId] = { ...(existing ?? {}), [subId]: value }
      } else {
        updated[supplierId][criterionId] = value
      }
      return updated
    })
  }

  // Returns null if not yet scored, number if explicitly set
  const getScore = (supplierId: string, criterionId: string, subId?: string): number | null => {
    const crit = scores[supplierId]?.[criterionId]
    if (subId) {
      if (typeof crit === 'object' && crit !== null)
        return ((crit as Record<string, number | null>)[subId]) ?? null
      return null
    }
    if (typeof crit === 'number') return crit
    return null
  }

  // For totals: treat null as 0
  const getScoreValue = (supplierId: string, criterionId: string, subId?: string): number =>
    getScore(supplierId, criterionId, subId) ?? 0

  const criterionTotal = (supplierId: string, criterionId: string): number => {
    if (!plan) return 0
    const c = plan.criteria.find(c => c.id === criterionId)
    if (!c) return 0
    if (c.has_subcriteria)
      return c.subcriteria.reduce((sum, sc) => sum + getScoreValue(supplierId, c.id, sc.id), 0)
    return getScoreValue(supplierId, c.id)
  }

  const supplierTotal = (supplierId: string): number => {
    if (!plan) return 0
    return plan.criteria.reduce((sum, c) => sum + criterionTotal(supplierId, c.id), 0)
  }

  // Count how many cells have been explicitly scored (null = not counted)
  const scoredCells = useMemo(() => {
    if (!plan) return 0
    let count = 0
    for (const s of tender.suppliers) {
      for (const c of plan.criteria) {
        if (c.has_subcriteria) {
          for (const sc of c.subcriteria) {
            if (getScore(s.id, c.id, sc.id) !== null) count++
          }
        } else {
          if (getScore(s.id, c.id) !== null) count++
        }
      }
    }
    return count
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scores, plan, tender.suppliers])

  // True only when every cell has been explicitly scored
  const allScored = results !== null && !!plan && scoredCells === totalCells && totalCells > 0

  // Whether all three suppliers have results for a given criterion (for comparison trigger)
  const allSuppliersHaveResult = (criterionId: string, subId?: string): boolean => {
    if (!results) return false
    return tender.suppliers.every(s => {
      if (subId) {
        const sub = results[s.id]?.[criterionId] as any
        return !!sub?.subcriteria?.[subId]
      }
      return !!(results[s.id]?.[criterionId])
    })
  }

  // Build evidence map for comparison (supplier_id → evidence text)
  const buildEvidenceMap = (criterionId: string, subId?: string): Record<string, string> => {
    if (!results) return {}
    return Object.fromEntries(
      tender.suppliers.map(s => {
        if (subId) {
          const sub = results[s.id]?.[criterionId] as any
          return [s.id, (sub?.subcriteria?.[subId] as CriterionResult)?.evidence ?? '']
        }
        return [s.id, (results[s.id]?.[criterionId] as CriterionResult)?.evidence ?? '']
      })
    )
  }

  // ── Stream handler ───────────────────────────────────────────────────────────

  const handleRunEvaluation = useCallback(() => {
    setRunning(true)
    onEvalUpdate(tender.tender_id, null, {})
    setSubmitted(false)
    setCompletedCells(0)
    setCurrentCell('')

    streamEvaluation(
      tender.tender_id,
      i18n.language,
      (event) => {
        const { supplier_id, criterion_id, subcriterion_id, result } = event
        setCurrentCell(`${result.supplier_name} — ${result.criterion_name}`)
        setCompletedCells(n => n + 1)

        setResults(prev => {
          const updated = { ...(prev ?? {}) }
          if (!updated[supplier_id]) updated[supplier_id] = {}

          if (subcriterion_id) {
            const existing = updated[supplier_id][criterion_id] as any
            updated[supplier_id][criterion_id] = {
              has_subcriteria: true,
              criterion_name: result.criterion_name.split(' — ')[0] ?? result.criterion_name,
              max_points: plan?.criteria.find(c => c.id === criterion_id)?.max_points ?? 0,
              subcriteria: {
                ...(existing?.subcriteria ?? {}),
                [subcriterion_id]: result,
              },
            }
          } else {
            updated[supplier_id][criterion_id] = result
          }
          return updated
        })
      },
      () => {
        setRunning(false)
        setCurrentCell('')
      },
      (err) => {
        setRunning(false)
        setCurrentCell(`Error: ${err}`)
      },
    )
  }, [tender.tender_id, i18n.language, plan, onEvalUpdate])

  // ── Render ───────────────────────────────────────────────────────────────────

  if (planLoading) return <Spinner label="Loading evaluation plan…" />
  if (planError) return <p className="text-red-500 text-sm">Failed to load plan.</p>
  if (!plan) return null

  if (reviewMode && plan && results) {
    const supplier = tender.suppliers[reviewSupIdx]
    const criterion = plan.criteria[reviewCritIdx]
    const totalSteps = tender.suppliers.length * plan.criteria.length
    const currentStep = reviewSupIdx * plan.criteria.length + reviewCritIdx + 1
    const isFirst = reviewSupIdx === 0 && reviewCritIdx === 0
    const isLast = reviewSupIdx === tender.suppliers.length - 1 && reviewCritIdx === plan.criteria.length - 1

    const goNext = () => {
      if (reviewCritIdx < plan.criteria.length - 1) {
        setReviewCritIdx(i => i + 1)
      } else if (reviewSupIdx < tender.suppliers.length - 1) {
        setReviewSupIdx(i => i + 1)
        setReviewCritIdx(0)
      } else {
        // All reviewed — exit review mode, show summary/sign
        setReviewMode(false)
      }
    }

    const goPrev = () => {
      if (reviewCritIdx > 0) {
        setReviewCritIdx(i => i - 1)
      } else if (reviewSupIdx > 0) {
        setReviewSupIdx(i => i - 1)
        setReviewCritIdx(plan.criteria.length - 1)
      }
    }

    return (
      <div className="flex flex-col gap-0" style={{ height: 'calc(100vh - 56px)' }}>

        {/* ── Progress bar ── */}
        <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-4 shrink-0">
          <button onClick={() => setReviewMode(false)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            ← Back to grid
          </button>
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>
                <span className="font-semibold text-gray-800">{supplier.name}</span>
                <span className="text-gray-400 mx-1.5">·</span>
                {criterion.name}
              </span>
              <span className="font-mono text-[#0057A8]">{currentStep} / {totalSteps}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-[#0057A8] h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${Math.round((currentStep / totalSteps) * 100)}%` }}
              />
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={goPrev}
              disabled={isFirst}
              className="text-xs border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1.5 rounded-lg transition-colors"
            >
              ← Prev
            </button>
            <button
              onClick={goNext}
              className="text-xs bg-[#0057A8] hover:bg-[#004a94] text-white font-semibold px-4 py-1.5 rounded-lg transition-colors"
            >
              {isLast ? '✅ Finish Review' : 'Next →'}
            </button>
          </div>
        </div>

        {/* ── Split screen ── */}
        <div className="flex-1 grid grid-cols-2 gap-0 overflow-hidden">

          {/* LEFT — AI Analysis */}
          <div className="border-r border-gray-100 overflow-y-auto p-6 bg-white">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <p className="text-[11px] font-bold text-amber-600 uppercase tracking-widest">AI Analysis</p>
              </div>
              <div className="flex items-baseline gap-2">
                <h2 className="text-lg font-bold text-gray-900">{criterion.name}</h2>
                <span className="text-xs bg-[#0057A8]/10 text-[#0057A8] font-mono font-semibold px-2 py-0.5 rounded-full">
                  {criterion.max_points} pts
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {criterion.has_subcriteria ? (
                criterion.subcriteria.map(sc => {
                  const subResults = results[supplier.id]?.[criterion.id] as any
                  const cellResult = subResults?.subcriteria?.[sc.id] as CriterionResult | undefined
                  return (
                    <div key={sc.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-0.5 h-4 bg-[#0057A8]/30 rounded" />
                        <p className="text-xs font-semibold text-gray-600">{sc.name}</p>
                        <span className="text-[10px] text-gray-400 font-mono">{sc.points} pts</span>
                      </div>
                      {cellResult ? (
                        <EvidenceCard
                          result={cellResult}
                          score={getScore(supplier.id, criterion.id, sc.id)}
                          maxPoints={sc.points}
                          onScoreChange={v => setScore(supplier.id, criterion.id, v, sc.id)}
                        />
                      ) : (
                        <div className="p-3 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                          <p className="text-xs text-gray-400 italic">Not yet evaluated</p>
                        </div>
                      )}
                    </div>
                  )
                })
              ) : (
                (() => {
                  const cellResult = results[supplier.id]?.[criterion.id] as CriterionResult | undefined
                  return cellResult ? (
                    <EvidenceCard
                      result={cellResult}
                      score={getScore(supplier.id, criterion.id)}
                      maxPoints={criterion.max_points}
                      onScoreChange={v => setScore(supplier.id, criterion.id, v)}
                    />
                  ) : (
                    <div className="p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                      <p className="text-sm text-gray-400 italic">Not yet evaluated — run the evaluation first.</p>
                    </div>
                  )
                })()
              )}
            </div>
          </div>

          {/* RIGHT — Source document */}
          <div className="overflow-y-auto p-6 bg-gray-50">
            <SourceChunksPanel
              tenderId={tender.tender_id}
              supplierId={supplier.id}
              criterionId={criterion.id}
              criterionName={criterion.name}
              supplierName={supplier.name}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-7xl">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">{t('app_title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{tender.label}</p>
      </div>

      {/* Supplier chips */}
      <div className="flex flex-wrap gap-2">
        {tender.suppliers.map(s => (
          <span key={s.id} className="text-xs bg-white border border-gray-200 text-gray-600 px-3 py-1 rounded-full shadow-sm">
            ✓ {s.name}
          </span>
        ))}
      </div>

      {/* ── Step 1: Evaluation plan ─────────────────────────────────────────── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider border-l-4 border-[#0057A8] pl-3 mb-3">
          {t('step_1')}
        </h2>
        <PlanTable plan={plan} />
        <p className="text-xs text-gray-400 mt-2 italic">{t('step_1_caption')}</p>
      </section>

      <hr className="border-gray-200" />

      {/* ── Step 2: Run ─────────────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider border-l-4 border-[#0057A8] pl-3 mb-3">
          {t('step_2')}
        </h2>

        <button
          onClick={handleRunEvaluation}
          disabled={running || results !== null}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold text-sm px-5 py-2 rounded-md transition-colors"
        >
          {running ? 'Running…' : results ? 'Evaluation complete ✓' : t('run_button')}
        </button>

        {/* Evaluation progress bar */}
        {(running || (results && completedCells > 0)) && (
          <div className="mt-4 space-y-1.5 max-w-lg">
            <div className="flex justify-between text-xs text-gray-600">
              <span className="truncate mr-4">{running ? currentCell : '✓ All evidence extracted'}</span>
              <span className="font-mono text-amber-500 shrink-0">{completedCells} / {totalCells} cells</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Scoring progress (shown once evaluation is done) */}
        {results && !running && totalCells > 0 && (
          <div className="mt-3 space-y-1.5 max-w-lg">
            <div className="flex justify-between text-xs text-gray-600">
              <span>Scores entered</span>
              <span className={`font-mono shrink-0 ${allScored ? 'text-green-600' : 'text-gray-500'}`}>
                {scoredCells} / {totalCells} cells
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${allScored ? 'bg-[#0057A8]' : 'bg-[#0057A8]'}`}
                style={{ width: `${totalCells > 0 ? Math.round((scoredCells / totalCells) * 100) : 0}%` }}
              />
            </div>
            {!allScored && (
              <p className="text-xs text-gray-500 italic">
                Enter a score for each supplier cell to unlock the summary.
              </p>
            )}
          </div>
        )}

        {!results && !running && (
          <p className="mt-3 bg-[#0057A8]/5 border border-[#0057A8]/20 rounded-xl p-4 text-sm text-[#0057A8]">{t('run_info')}</p>
        )}
      </section>

      {/* ── Step 3: Evaluation grid ─────────────────────────────────────────── */}
      {(results || running) && (
        <>
          <hr className="border-gray-200" />
          <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider border-l-4 border-[#0057A8] pl-3 mb-4">
              {t('step_3')}
            </h2>
            <p className="text-xs text-gray-400 mb-6">{t('grid_caption')}</p>

            {plan.criteria.map(criterion => (
              <div key={criterion.id} className="mb-10">

                {/* Criterion header */}
                <div className="flex items-baseline gap-3 mb-4 pb-2 border-b border-gray-200">
                  <h3 className="text-base font-semibold text-gray-800">{criterion.name}</h3>
                  <span className="text-xs text-amber-600 font-mono bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                    {criterion.max_points} pts
                  </span>
                </div>

                {criterion.has_subcriteria ? (
                  <>
                    {criterion.subcriteria.map(sc => (
                      <div key={sc.id} className="mb-6">
                        {/* Sub-criterion label */}
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-1 h-4 bg-[#0057A8] rounded" />
                          <p className="text-xs font-medium text-gray-700">
                            {sc.name}
                          </p>
                          <span className="text-xs text-gray-400 font-mono">{sc.points} pts</span>
                        </div>

                        {/* 3-column grid */}
                        <div className="grid grid-cols-3 gap-4">
                          {tender.suppliers.map(supplier => {
                            const subResults = results?.[supplier.id]?.[criterion.id] as any
                            const cellResult = subResults?.subcriteria?.[sc.id] as CriterionResult | undefined
                            return (
                              <CellCard
                                key={supplier.id}
                                loaded={!!cellResult}
                                supplierName={supplier.name}
                              >
                                {cellResult && (
                                  <EvidenceCard
                                    result={cellResult}
                                    score={getScore(supplier.id, criterion.id, sc.id)}
                                    maxPoints={sc.points}
                                    onScoreChange={v => setScore(supplier.id, criterion.id, v, sc.id)}
                                  />
                                )}
                              </CellCard>
                            )
                          })}
                        </div>

                        {/* Comparison panel for this sub-criterion */}
                        {allSuppliersHaveResult(criterion.id, sc.id) && (
                          <ComparisonPanel
                            key={`${criterion.id}-${sc.id}-${i18n.language}`}
                            tenderId={tender.tender_id}
                            criterionId={`${criterion.id}_${sc.id}`}
                            criterionName={`${criterion.name} — ${sc.name}`}
                            evidence={buildEvidenceMap(criterion.id, sc.id)}
                          />
                        )}
                      </div>
                    ))}

                    {/* Subtotals row */}
                    {tender.suppliers.some(s => criterionTotal(s.id, criterion.id) > 0) && (
                      <div className="mt-2 pt-3 border-t border-gray-200">
                        <p className="text-xs text-gray-400 mb-2">Subtotals ({criterion.max_points} pts)</p>
                        <div className="grid grid-cols-3 gap-4">
                          {tender.suppliers.map(s => (
                            <div key={s.id} className="text-center">
                              <p className="text-xs text-gray-500 truncate">{s.name}</p>
                              <p className="text-lg font-bold text-[#0057A8] font-mono">
                                {criterionTotal(s.id, criterion.id).toFixed(1)}
                                <span className="text-xs text-gray-400 font-normal"> / {criterion.max_points}</span>
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      {tender.suppliers.map(supplier => {
                        const cellResult = results?.[supplier.id]?.[criterion.id] as CriterionResult | undefined
                        return (
                          <CellCard
                            key={supplier.id}
                            loaded={!!cellResult}
                            supplierName={supplier.name}
                          >
                            {cellResult && (
                              <EvidenceCard
                                result={cellResult}
                                score={getScore(supplier.id, criterion.id)}
                                maxPoints={criterion.max_points}
                                onScoreChange={v => setScore(supplier.id, criterion.id, v)}
                              />
                            )}
                          </CellCard>
                        )
                      })}
                    </div>

                    {/* Comparison panel */}
                    {allSuppliersHaveResult(criterion.id) && (
                      <ComparisonPanel
                        key={`${criterion.id}-${i18n.language}`}
                        tenderId={tender.tender_id}
                        criterionId={criterion.id}
                        criterionName={criterion.name}
                        evidence={buildEvidenceMap(criterion.id)}
                      />
                    )}
                  </>
                )}
              </div>
            ))}

            {/* Review Evaluations button */}
            {results && !running && (
              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => { setReviewMode(true); setReviewSupIdx(0); setReviewCritIdx(0) }}
                  className="bg-[#0057A8] hover:bg-[#004a94] text-white font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors shadow-sm"
                >
                  📋 Review Evaluations
                </button>
              </div>
            )}
          </section>

          {/* ── Step 4: Summary ─────────────────────────────────────────────── */}
          {allScored && (
            <>
              <hr className="border-gray-200" />
              <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider border-l-4 border-[#0057A8] pl-3 mb-4">
                  {t('step_4')}
                </h2>

                <div className="rounded-lg border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                        <th className="text-left px-4 py-2">{t('supplier_col')}</th>
                        {plan.criteria.map(c => (
                          <th key={c.id} className="text-right px-4 py-2 max-w-24">
                            <span className="truncate block">{c.name}</span>
                          </th>
                        ))}
                        <th className="text-right px-4 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {tender.suppliers.map((s, i) => {
                        const total = supplierTotal(s.id)
                        const isLeader = i === [...tender.suppliers]
                          .sort((a, b) => supplierTotal(b.id) - supplierTotal(a.id))
                          .findIndex(x => x.id === s.id) + 1 &&
                          [...tender.suppliers].sort((a, b) => supplierTotal(b.id) - supplierTotal(a.id))[0].id === s.id
                        return (
                          <tr key={s.id} className={isLeader ? 'bg-green-50' : 'bg-white'}>
                            <td className="px-4 py-2.5 text-gray-800 font-medium">
                              {s.name}
                              {isLeader && <span className="ml-2 text-[#16A34A] text-xs">★</span>}
                            </td>
                            {plan.criteria.map(c => (
                              <td key={c.id} className="px-4 py-2.5 text-right text-gray-600 font-mono text-sm">
                                {criterionTotal(s.id, c.id).toFixed(1)}
                              </td>
                            ))}
                            <td className="px-4 py-2.5 text-right font-bold text-[#0057A8] font-mono">
                              {total.toFixed(1)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {allScored && (() => {
                  const winner = [...tender.suppliers].sort((a, b) => supplierTotal(b.id) - supplierTotal(a.id))[0]
                  const maxSobreB = plan.criteria.reduce((s, c) => s + c.max_points, 0)
                  return (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                      🏆 {t('summary_winner', {
                        name: winner?.name,
                        total: supplierTotal(winner?.id ?? '').toFixed(1),
                        max: maxSobreB,
                      })}
                    </div>
                  )
                })()}
              </section>

              {/* ── Step 5: Sign and submit ──────────────────────────────────── */}
              {allScored && (
                <>
                  <hr className="border-gray-200" />
                  <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider border-l-4 border-[#0057A8] pl-3 mb-3">
                      {t('step_5')}
                    </h2>
                    <div className="space-y-3 max-w-md">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">{t('evaluator_label')}</label>
                        <input
                          type="text"
                          placeholder={t('evaluator_placeholder')}
                          value={evaluatorId}
                          onChange={e => setEvaluatorId(e.target.value)}
                          disabled={submitted}
                          className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#0057A8] disabled:opacity-50"
                        />
                      </div>
                      <p className="text-xs text-gray-400">{t('submit_legal_caption')}</p>
                      <button
                        disabled={!evaluatorId || submitted}
                        onClick={async () => {
                          // Normalise null scores → 0 before persisting
                          const normalisedScores = Object.fromEntries(
                            tender.suppliers.map(s => [
                              s.id,
                              Object.fromEntries(
                                (plan?.criteria ?? []).map(c => {
                                  if (c.has_subcriteria) {
                                    return [c.id, Object.fromEntries(
                                      c.subcriteria.map(sc => [sc.id, getScoreValue(s.id, c.id, sc.id)])
                                    )]
                                  }
                                  return [c.id, getScoreValue(s.id, c.id)]
                                })
                              ),
                            ])
                          )
                          await submitAuditEntry({
                            evaluator_id: evaluatorId,
                            timestamp: new Date().toISOString(),
                            contract: tender.tender_id.toUpperCase().replace(/_/g, '-'),
                            tender_label: tender.label,
                            language: i18n.language,
                            regulatory_note: t('regulatory_note'),
                            scores: normalisedScores,
                            evidence: Object.fromEntries(
                              tender.suppliers.map(s => [s.id, results?.[s.id] ?? {}])
                            ),
                          })
                          setSubmitted(true)
                        }}
                        className="bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-5 py-2 rounded-md transition-colors"
                      >
                        {t('submit_button')}
                      </button>
                      {submitted && (
                        <p className="text-sm text-green-600">✅ {t('submit_success')}</p>
                      )}
                    </div>
                  </section>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── Cell card wrapper ──────────────────────────────────────────────────────────

function CellCard({
  loaded,
  supplierName,
  children,
}: {
  loaded: boolean
  supplierName: string
  children?: React.ReactNode
}) {
  return (
    <div className={`rounded-xl p-3 border transition-colors ${
      loaded
        ? 'bg-white border-gray-100 shadow-sm'
        : 'bg-gray-50 border-gray-200 border-dashed'
    }`}>
      {loaded ? children : (
        <div className="flex items-center gap-2 h-24">
          <Spinner />
          <span className="text-xs text-gray-400">{supplierName}</span>
        </div>
      )}
    </div>
  )
}
