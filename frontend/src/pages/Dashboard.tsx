import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchPlan } from '../api/tenders'
import { streamEvaluation } from '../api/evaluate'
import PlanTable from '../components/PlanTable'
import EvidenceCard from '../components/EvidenceCard'
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
  const [progress, setProgress] = useState('')
  const [evaluatorId, setEvaluatorId] = useState('')
  const [submitted, setSubmitted] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars

  // Load evaluation plan
  const {
    data: plan,
    isLoading: planLoading,
    error: planError,
  } = useQuery({
    queryKey: ['plan', tender.tender_id],
    queryFn: () => fetchPlan(tender.tender_id),
  })

  const handleRunEvaluation = useCallback(() => {
    setRunning(true)
    setResults(null)
    setScores({})
    setSubmitted(false)

    streamEvaluation(
      tender.tender_id,
      i18n.language,
      (event) => {
        const { supplier_id, criterion_id, subcriterion_id, result } = event
        setProgress(`${result.supplier_name} — ${result.criterion_name}`)

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
        setProgress('')
      },
      (err) => {
        setRunning(false)
        setProgress(`Error: ${err}`)
      },
    )
  }, [tender.tender_id, i18n.language, plan])

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
    if (subId && typeof crit === 'object' && crit !== null) return (crit as Record<string, number>)[subId] ?? 0
    if (!subId && typeof crit === 'number') return crit
    return 0
  }

  const supplierTotal = (supplierId: string): number => {
    if (!plan) return 0
    return plan.criteria.reduce((total, c) => {
      if (c.has_subcriteria) {
        return total + c.subcriteria.reduce((sub, sc) => sub + getScore(supplierId, c.id, sc.id), 0)
      }
      return total + getScore(supplierId, c.id)
    }, 0)
  }

  const allScored = results !== null && plan !== null && plan !== undefined &&
    tender.suppliers.every(s =>
      plan!.criteria.every(c => {
        if (c.has_subcriteria) return c.subcriteria.every(sc => getScore(s.id, c.id, sc.id) !== undefined)
        return typeof scores[s.id]?.[c.id] === 'number'
      })
    )

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

      {/* Suppliers loaded */}
      <div className="flex flex-wrap gap-2">
        {tender.suppliers.map(s => (
          <span key={s.id} className="text-xs bg-slate-800 border border-slate-700 text-slate-300 px-3 py-1 rounded-full">
            ✓ {s.name}
          </span>
        ))}
      </div>

      {/* Step 1 — Evaluation plan */}
      <section>
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
          Step 1 — Evaluation Plan
        </h2>
        <PlanTable plan={plan} />
        <p className="text-xs text-slate-500 mt-2 italic">
          Generated by the Planning Agent from the PCAP document. Criteria with sub-criteria are evaluated at the sub-criterion level.
        </p>
      </section>

      <hr className="border-slate-800" />

      {/* Step 2 — Run evaluation */}
      <section>
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
          Step 2 — {t('run_button')}
        </h2>
        <button
          onClick={handleRunEvaluation}
          disabled={running || results !== null}
          className="bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-semibold text-sm px-5 py-2 rounded-md transition-colors"
        >
          {running ? 'Running…' : results ? 'Evaluation complete' : t('run_button')}
        </button>
        {running && (
          <div className="flex items-center gap-3 mt-3">
            <Spinner />
            <span className="text-xs text-slate-400">{progress}</span>
          </div>
        )}
        {!results && !running && (
          <p className="text-xs text-slate-500 mt-2">{t('run_info')}</p>
        )}
      </section>

      {/* Step 3 — Evaluation grid */}
      {results && (
        <>
          <hr className="border-slate-800" />
          <section>
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
              Step 3 — {t('grid_subheader')}
            </h2>
            <p className="text-xs text-slate-500 mb-4">{t('grid_caption')}</p>

            {plan.criteria.map(criterion => (
              <div key={criterion.id} className="mb-8">
                <h3 className="text-base font-semibold text-white mb-3">
                  {criterion.name}
                  <span className="text-xs text-amber-400 font-mono ml-2">
                    ({criterion.max_points} pts)
                  </span>
                </h3>

                {criterion.has_subcriteria ? (
                  criterion.subcriteria.map(sc => (
                    <div key={sc.id} className="mb-4">
                      <p className="text-xs text-slate-400 mb-2 pl-1 border-l-2 border-slate-700">
                        {sc.name} — {sc.points} pts
                      </p>
                      <div className="grid grid-cols-3 gap-4">
                        {tender.suppliers.map(supplier => {
                          const subResults = results[supplier.id]?.[criterion.id] as any
                          const cellResult = subResults?.subcriteria?.[sc.id] as CriterionResult | undefined
                          return (
                            <div key={supplier.id} className="bg-slate-800/40 rounded-lg p-3 border border-slate-700">
                              {cellResult ? (
                                <EvidenceCard
                                  result={cellResult}
                                  score={getScore(supplier.id, criterion.id, sc.id)}
                                  maxPoints={sc.points}
                                  onScoreChange={v => setScore(supplier.id, criterion.id, v, sc.id)}
                                />
                              ) : (
                                <div className="flex items-center gap-2 h-20">
                                  <Spinner />
                                  <span className="text-xs text-slate-500">{supplier.name}</span>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="grid grid-cols-3 gap-4">
                    {tender.suppliers.map(supplier => {
                      const cellResult = results[supplier.id]?.[criterion.id] as CriterionResult | undefined
                      return (
                        <div key={supplier.id} className="bg-slate-800/40 rounded-lg p-3 border border-slate-700">
                          {cellResult ? (
                            <EvidenceCard
                              result={cellResult}
                              score={getScore(supplier.id, criterion.id)}
                              maxPoints={criterion.max_points}
                              onScoreChange={v => setScore(supplier.id, criterion.id, v)}
                            />
                          ) : (
                            <div className="flex items-center gap-2 h-20">
                              <Spinner />
                              <span className="text-xs text-slate-500">{supplier.name}</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </section>

          {/* Step 4 — Summary */}
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
                      <th key={c.id} className="text-right px-4 py-2">{c.name}</th>
                    ))}
                    <th className="text-right px-4 py-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {tender.suppliers.map(s => (
                    <tr key={s.id} className="bg-slate-900">
                      <td className="px-4 py-2 text-slate-200">{s.name}</td>
                      {plan.criteria.map(c => (
                        <td key={c.id} className="px-4 py-2 text-right text-slate-300 font-mono">
                          {c.has_subcriteria
                            ? c.subcriteria.reduce((sum, sc) => sum + getScore(s.id, c.id, sc.id), 0).toFixed(1)
                            : getScore(s.id, c.id).toFixed(1)
                          }
                        </td>
                      ))}
                      <td className="px-4 py-2 text-right font-bold text-amber-400 font-mono">
                        {supplierTotal(s.id).toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {allScored && (
              <div className="mt-3 p-3 bg-green-900/30 border border-green-700 rounded-lg text-sm text-green-300">
                🏆 {t('summary_winner', {
                  name: [...tender.suppliers].sort((a, b) => supplierTotal(b.id) - supplierTotal(a.id))[0]?.name,
                  total: Math.max(...tender.suppliers.map(s => supplierTotal(s.id))).toFixed(1),
                  max: plan.criteria.reduce((s, c) => s + c.max_points, 0),
                })}
              </div>
            )}
          </section>

          {/* Step 5 — Submit */}
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
                      const { submitAuditEntry } = await import('../api/audit')
                      await submitAuditEntry({
                        evaluator_id: evaluatorId,
                        timestamp: new Date().toISOString(),
                        contract: tender.tender_id.toUpperCase().replace(/_/g, '-'),
                        tender_label: tender.label,
                        language: i18n.language,
                        regulatory_note: t('regulatory_note'),
                        scores,
                        evidence: Object.fromEntries(
                          tender.suppliers.map(s => [s.id, results[s.id] ?? {}])
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
    </div>
  )
}
