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
import type {
  TenderSummary,
  EvaluationResults,
  CriterionResult,
  ScoreMap,
} from '../types'

interface DashboardProps {
  tender: TenderSummary
}

export default function Dashboard({ tender }: DashboardProps) {
  const { t, i18n } = useTranslation()

  const [results, setResults] = useState<EvaluationResults | null>(null)
  const [scores, setScores] = useState<ScoreMap>({})
  const [running, setRunning] = useState(false)
  const [completedCells, setCompletedCells] = useState(0)
  const [currentCell, setCurrentCell] = useState('')
  const [evaluatorId, setEvaluatorId] = useState('')
  const [submitted, setSubmitted] = useState(false)

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

  const setScore = (supplierId: string, criterionId: string, value: number, subId?: string) => {
    setScores(prev => {
      const updated = { ...prev }
      if (!updated[supplierId]) updated[supplierId] = {}
      if (subId) {
        const existing = updated[supplierId][criterionId] as Record<string, number> | undefined
        updated[supplierId][criterionId] = { ...(existing ?? {}), [subId]: value }
      } else {
        updated[supplierId][criterionId] = value
      }
      return updated
    })
  }

  const getScore = (supplierId: string, criterionId: string, subId?: string): number => {
    const crit = scores[supplierId]?.[criterionId]
    if (subId && typeof crit === 'object' && crit !== null)
      return (crit as Record<string, number>)[subId] ?? 0
    if (!subId && typeof crit === 'number') return crit
    return 0
  }

  const criterionTotal = (supplierId: string, criterionId: string): number => {
    if (!plan) return 0
    const c = plan.criteria.find(c => c.id === criterionId)
    if (!c) return 0
    if (c.has_subcriteria)
      return c.subcriteria.reduce((sum, sc) => sum + getScore(supplierId, c.id, sc.id), 0)
    return getScore(supplierId, c.id)
  }

  const supplierTotal = (supplierId: string): number => {
    if (!plan) return 0
    return plan.criteria.reduce((sum, c) => sum + criterionTotal(supplierId, c.id), 0)
  }

  // True when all supplier × criterion pairs have a score entered
  const allScored = results !== null && !!plan &&
    tender.suppliers.every(s =>
      plan.criteria.every(c => {
        if (c.has_subcriteria)
          return c.subcriteria.every(sc => getScore(s.id, c.id, sc.id) > 0 || getScore(s.id, c.id, sc.id) === 0)
        return typeof scores[s.id]?.[c.id] === 'number'
      })
    )

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
    setResults(null)
    setScores({})
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
  }, [tender.tender_id, i18n.language, plan])

  // ── Render ───────────────────────────────────────────────────────────────────

  if (planLoading) return <Spinner label="Loading evaluation plan…" />
  if (planError) return <p className="text-red-400 text-sm">Failed to load plan.</p>
  if (!plan) return null

  return (
    <div className="space-y-6 max-w-7xl">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">{t('app_title')}</h1>
        <p className="text-sm text-slate-400 mt-1">{tender.label}</p>
      </div>

      {/* Supplier chips */}
      <div className="flex flex-wrap gap-2">
        {tender.suppliers.map(s => (
          <span key={s.id} className="text-xs bg-slate-800 border border-slate-700 text-slate-300 px-3 py-1 rounded-full">
            ✓ {s.name}
          </span>
        ))}
      </div>

      {/* ── Step 1: Evaluation plan ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
          Step 1 — Evaluation Plan
        </h2>
        <PlanTable plan={plan} />
        <p className="text-xs text-slate-500 mt-2 italic">
          Generated by the Planning Agent from the PCAP. Criteria with sub-criteria are evaluated at the sub-criterion level.
        </p>
      </section>

      <hr className="border-slate-800" />

      {/* ── Step 2: Run ─────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
          Step 2 — {t('run_button')}
        </h2>

        <button
          onClick={handleRunEvaluation}
          disabled={running || results !== null}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold text-sm px-5 py-2 rounded-md transition-colors"
        >
          {running ? 'Running…' : results ? 'Evaluation complete ✓' : t('run_button')}
        </button>

        {/* Progress bar */}
        {(running || (results && completedCells > 0)) && (
          <div className="mt-4 space-y-2 max-w-lg">
            <div className="flex justify-between text-xs text-slate-400">
              <span>{running ? currentCell : 'All cells complete'}</span>
              <span className="font-mono text-amber-400">{completedCells} / {totalCells}</span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {!results && !running && (
          <p className="text-xs text-slate-500 mt-2">{t('run_info')}</p>
        )}
      </section>

      {/* ── Step 3: Evaluation grid ─────────────────────────────────────────── */}
      {(results || running) && (
        <>
          <hr className="border-slate-800" />
          <section>
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
              Step 3 — {t('grid_subheader')}
            </h2>
            <p className="text-xs text-slate-500 mb-6">{t('grid_caption')}</p>

            {plan.criteria.map(criterion => (
              <div key={criterion.id} className="mb-10">

                {/* Criterion header */}
                <div className="flex items-baseline gap-3 mb-4 pb-2 border-b border-slate-800">
                  <h3 className="text-base font-semibold text-white">{criterion.name}</h3>
                  <span className="text-xs text-amber-400 font-mono bg-amber-500/10 px-2 py-0.5 rounded">
                    {criterion.max_points} pts
                  </span>
                </div>

                {criterion.has_subcriteria ? (
                  <>
                    {criterion.subcriteria.map(sc => (
                      <div key={sc.id} className="mb-6">
                        {/* Sub-criterion label */}
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-1 h-4 bg-slate-600 rounded" />
                          <p className="text-xs font-medium text-slate-300">
                            {sc.name}
                          </p>
                          <span className="text-xs text-slate-500 font-mono">{sc.points} pts</span>
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
                      <div className="mt-2 pt-3 border-t border-slate-800">
                        <p className="text-xs text-slate-500 mb-2">Subtotals ({criterion.max_points} pts)</p>
                        <div className="grid grid-cols-3 gap-4">
                          {tender.suppliers.map(s => (
                            <div key={s.id} className="text-center">
                              <p className="text-xs text-slate-400 truncate">{s.name}</p>
                              <p className="text-lg font-bold text-amber-400 font-mono">
                                {criterionTotal(s.id, criterion.id).toFixed(1)}
                                <span className="text-xs text-slate-600 font-normal"> / {criterion.max_points}</span>
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
          </section>

          {/* ── Step 4: Summary ─────────────────────────────────────────────── */}
          {results && (
            <>
              <hr className="border-slate-800" />
              <section>
                <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
                  Step 4 — {t('summary_subheader')}
                </h2>

                <div className="rounded-lg border border-slate-700 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                        <th className="text-left px-4 py-2">{t('supplier_col')}</th>
                        {plan.criteria.map(c => (
                          <th key={c.id} className="text-right px-4 py-2 max-w-24">
                            <span className="truncate block">{c.name}</span>
                          </th>
                        ))}
                        <th className="text-right px-4 py-2">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {tender.suppliers.map((s, i) => {
                        const total = supplierTotal(s.id)
                        const isLeader = i === [...tender.suppliers]
                          .sort((a, b) => supplierTotal(b.id) - supplierTotal(a.id))
                          .findIndex(x => x.id === s.id) + 1 &&
                          [...tender.suppliers].sort((a, b) => supplierTotal(b.id) - supplierTotal(a.id))[0].id === s.id
                        return (
                          <tr key={s.id} className={isLeader ? 'bg-amber-500/5' : 'bg-slate-900'}>
                            <td className="px-4 py-2.5 text-slate-200 font-medium">
                              {s.name}
                              {isLeader && <span className="ml-2 text-amber-400 text-xs">★</span>}
                            </td>
                            {plan.criteria.map(c => (
                              <td key={c.id} className="px-4 py-2.5 text-right text-slate-300 font-mono text-sm">
                                {criterionTotal(s.id, c.id).toFixed(1)}
                              </td>
                            ))}
                            <td className="px-4 py-2.5 text-right font-bold text-amber-400 font-mono">
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
                    <div className="mt-3 p-3 bg-green-900/20 border border-green-700/50 rounded-lg text-sm text-green-300">
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
                  <hr className="border-slate-800" />
                  <section>
                    <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
                      Step 5 — {t('submit_subheader')}
                    </h2>
                    <div className="space-y-3 max-w-md">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">{t('evaluator_label')}</label>
                        <input
                          type="text"
                          placeholder={t('evaluator_placeholder')}
                          value={evaluatorId}
                          onChange={e => setEvaluatorId(e.target.value)}
                          disabled={submitted}
                          className="w-full bg-slate-800 border border-slate-700 text-white text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
                        />
                      </div>
                      <p className="text-xs text-slate-500">{t('submit_legal_caption')}</p>
                      <button
                        disabled={!evaluatorId || submitted}
                        onClick={async () => {
                          await submitAuditEntry({
                            evaluator_id: evaluatorId,
                            timestamp: new Date().toISOString(),
                            contract: tender.tender_id.toUpperCase().replace(/_/g, '-'),
                            tender_label: tender.label,
                            language: i18n.language,
                            regulatory_note: t('regulatory_note'),
                            scores,
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
                        <p className="text-sm text-green-400">✅ {t('submit_success')}</p>
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
    <div className={`rounded-lg p-3 border transition-colors ${
      loaded
        ? 'bg-slate-800/40 border-slate-700'
        : 'bg-slate-800/20 border-slate-800 border-dashed'
    }`}>
      {loaded ? children : (
        <div className="flex items-center gap-2 h-24">
          <Spinner />
          <span className="text-xs text-slate-600">{supplierName}</span>
        </div>
      )}
    </div>
  )
}
