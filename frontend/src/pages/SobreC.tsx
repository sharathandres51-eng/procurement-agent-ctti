import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchSobreCCriteria, calculateSobreC } from '../api/sobreC'
import { fetchPlan } from '../api/tenders'
import Spinner from '../components/Spinner'
import type { TenderSummary, TenderEvalState, SobreCResponse } from '../types'

interface SobreCProps {
  tender: TenderSummary
  evalState: TenderEvalState
}

export default function SobreC({ tender, evalState }: SobreCProps) {
  const { t } = useTranslation()
  const { results, scores } = evalState

  const { data: criteriaData, isLoading, error } = useQuery({
    queryKey: ['sobre-c-criteria', tender.tender_id],
    queryFn: () => fetchSobreCCriteria(tender.tender_id),
  })

  const { data: plan } = useQuery({
    queryKey: ['plan', tender.tender_id],
    queryFn: () => fetchPlan(tender.tender_id),
    enabled: !!results,
  })

  // inputValues: field → supplierId → raw string from the input element
  const [inputValues, setInputValues] = useState<Record<string, Record<string, string>>>({})
  const [calcResult, setCalcResult] = useState<SobreCResponse | null>(null)
  const [isCalculating, setIsCalculating] = useState(false)
  const [calcError, setCalcError] = useState<string | null>(null)

  if (isLoading) return <Spinner label="Loading Sobre C criteria…" />
  if (error)     return <p className="text-red-500 text-sm">Failed to load Sobre C criteria.</p>
  if (!criteriaData) return null

  const supplierIds    = tender.suppliers.map(s => s.id)
  const criteriaFields = Object.keys(criteriaData.criteria)

  const allEntered = supplierIds.every(sid =>
    criteriaFields.every(f => {
      const v = inputValues[f]?.[sid]
      return v !== undefined && v.trim() !== ''
    })
  )

  const handleInput = (field: string, supplierId: string, value: string) => {
    setInputValues(prev => ({ ...prev, [field]: { ...prev[field], [supplierId]: value } }))
    setCalcResult(null)
  }

  const handleCalculate = async () => {
    setIsCalculating(true)
    setCalcError(null)
    try {
      const declared: Record<string, Record<string, number>> = {}
      for (const sid of supplierIds) {
        declared[sid] = {}
        for (const f of criteriaFields) {
          const raw = inputValues[f]?.[sid]
          const num = parseFloat(raw ?? '')
          if (Number.isNaN(num)) {
            throw new Error(`Invalid number for ${f} / ${sid}`)
          }
          declared[sid][f] = num
        }
      }
      const result = await calculateSobreC(tender.tender_id, declared)
      setCalcResult(result)
    } catch {
      setCalcError('Calculation failed. Check that all values are valid numbers.')
    } finally {
      setIsCalculating(false)
    }
  }

  // ── Sobre B helpers ────────────────────────────────────────────────────────
  const getScoreValue = (supplierId: string, criterionId: string, subId?: string): number => {
    const crit = scores[supplierId]?.[criterionId]
    if (subId && typeof crit === 'object' && crit !== null)
      return ((crit as Record<string, number | null>)[subId]) ?? 0
    if (!subId && typeof crit === 'number') return crit
    return 0
  }

  const sobreBTotal = (supplierId: string): number => {
    if (!plan) return 0
    return plan.criteria.reduce((sum, c) => {
      if (c.has_subcriteria)
        return sum + c.subcriteria.reduce((s, sc) => s + getScoreValue(supplierId, c.id, sc.id), 0)
      return sum + getScoreValue(supplierId, c.id)
    }, 0)
  }

  const maxSobreB   = plan?.criteria.reduce((s, c) => s + c.max_points, 0) ?? 49
  const sobreBReady = !!results && !!plan

  const sobreCWinner = calcResult
    ? supplierIds.reduce((best, sid) =>
        calcResult.results[sid].total > calcResult.results[best].total ? sid : best,
        supplierIds[0]
      )
    : null

  const combinedWinner = sobreBReady && calcResult
    ? supplierIds.reduce((best, sid) =>
        (sobreBTotal(sid) + calcResult.results[sid].total) >
        (sobreBTotal(best) + calcResult.results[best].total) ? sid : best,
        supplierIds[0]
      )
    : null

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('sobre_c_title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{tender.label}</p>
      </div>

      {/* Info banner */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
        ℹ️ {t('sobre_c_info')}
      </div>

      {/* ── Declared values input form ──────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            {t('declared_subheader')}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Enter the declared values from each supplier's Sobre C envelope.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-600 uppercase tracking-wider">
                <th className="text-left px-6 py-3 w-64">Criterion</th>
                <th className="text-center px-4 py-3 text-gray-400 font-normal normal-case whitespace-nowrap">
                  Max / Direction
                </th>
                {tender.suppliers.map(s => (
                  <th key={s.id} className="text-right px-6 py-3">{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {criteriaFields.map(field => {
                const def = criteriaData.criteria[field]
                return (
                  <tr key={field} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 text-gray-800 font-medium leading-snug">
                      {def.label}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-400 font-mono whitespace-nowrap">
                      {def.max_points} pts · {def.direction === 'lower' ? '↓' : '↑'}
                    </td>
                    {tender.suppliers.map(s => (
                      <td key={s.id} className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="0"
                            value={inputValues[field]?.[s.id] ?? ''}
                            onChange={e => handleInput(field, s.id, e.target.value)}
                            className="w-28 text-right border border-gray-300 rounded-lg px-2 py-1.5
                                       text-xs font-mono text-gray-900 placeholder:text-gray-400
                                       focus:outline-none focus:ring-2
                                       focus:ring-[#A81B0F] focus:border-transparent"
                          />
                          <span className="text-gray-400 text-xs w-8 text-left">{def.unit}</span>
                        </div>
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {criteriaData.total_points} points total · Proportionality formula (Directriu 1/2020)
          </p>
          <button
            onClick={handleCalculate}
            disabled={!allEntered || isCalculating}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              allEntered && !isCalculating
                ? 'bg-[#A81B0F] text-white hover:bg-[#8A160C] cursor-pointer'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isCalculating ? 'Calculating…' : 'Calculate Scores'}
          </button>
        </div>
        {calcError && (
          <p className="text-red-500 text-xs px-6 pb-4">{calcError}</p>
        )}
      </div>

      {/* ── Score breakdown - shown after calculation ───────────────────────── */}
      {calcResult && (
        <>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                {t('breakdown_subheader')}
              </h2>
              <p className="text-xs text-gray-500 mt-1">{t('breakdown_caption')}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-600 uppercase tracking-wider">
                    <th className="text-left px-6 py-3">{t('supplier_col')}</th>
                    {criteriaFields.map(f => (
                      <th key={f} className="text-right px-6 py-3">
                        {criteriaData.criteria[f].label.split('-')[0].trim()}
                        <span className="text-gray-400 normal-case font-normal">
                          {' '}/ {criteriaData.criteria[f].max_points}
                        </span>
                      </th>
                    ))}
                    <th className="text-right px-6 py-3 text-gray-700 font-semibold">
                      Total
                      <span className="text-gray-400 font-normal"> / {criteriaData.total_points}</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {supplierIds.map(sid => (
                    <tr
                      key={sid}
                      className={`transition-colors ${
                        sid === sobreCWinner ? 'bg-green-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-6 py-3 text-gray-800 font-medium">
                        {calcResult.results[sid].name}
                        {sid === sobreCWinner && (
                          <span className="ml-2 text-green-600 text-xs font-semibold">★ Sobre C</span>
                        )}
                      </td>
                      {criteriaFields.map(f => (
                        <td key={f} className="px-6 py-3 text-right text-gray-600 font-mono">
                          {calcResult.results[sid].criteria[f]?.score?.toFixed(2) ?? '-'}
                        </td>
                      ))}
                      <td className="px-6 py-3 text-right font-bold text-[#A81B0F] font-mono">
                        {calcResult.results[sid].total.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Combined final ranking ─────────────────────────────────────── */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                {t('ranking_subheader')}
              </h2>
              {!sobreBReady && (
                <span className="text-xs text-amber-600 italic">
                  ⚠️ {t('ranking_warning')}
                </span>
              )}
            </div>

            {sobreBReady ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider">
                        <th className="text-left px-6 py-3">{t('supplier_col')}</th>
                        <th className="text-right px-6 py-3">
                          {t('sobre_b_col', { max: Math.round(maxSobreB) })}
                        </th>
                        <th className="text-right px-6 py-3">{t('sobre_c_col')}</th>
                        <th className="text-right px-6 py-3">{t('combined_col')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {supplierIds
                        .map(sid => ({
                          sid,
                          sobreB:   sobreBTotal(sid),
                          sobreC:   calcResult.results[sid].total,
                          combined: sobreBTotal(sid) + calcResult.results[sid].total,
                          name:     calcResult.results[sid].name,
                        }))
                        .sort((a, b) => b.combined - a.combined)
                        .map((row, i) => (
                          <tr
                            key={row.sid}
                            className={`transition-colors ${
                              i === 0 ? 'bg-amber-50' : 'hover:bg-gray-50'
                            }`}
                          >
                            <td className="px-6 py-3 text-gray-800 font-medium">
                              {i === 0 && <span className="mr-2">🏆</span>}
                              {row.name}
                            </td>
                            <td className="px-6 py-3 text-right text-gray-600 font-mono">
                              {row.sobreB.toFixed(1)}
                            </td>
                            <td className="px-6 py-3 text-right text-gray-600 font-mono">
                              {row.sobreC.toFixed(2)}
                            </td>
                            <td className={`px-6 py-3 text-right font-bold font-mono ${
                              i === 0 ? 'text-[#A81B0F] text-base' : 'text-gray-600'
                            }`}>
                              {row.combined.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                <div className="mx-6 mb-4 mt-3 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                  🏆 {t('ranking_winner', {
                    name:  combinedWinner ? calcResult.results[combinedWinner].name : '-',
                    total: combinedWinner
                      ? (sobreBTotal(combinedWinner) + calcResult.results[combinedWinner].total).toFixed(2)
                      : '-',
                  })}
                </div>
                <p className="text-xs text-gray-500 italic px-6 pb-4">{t('ranking_caption')}</p>
              </>
            ) : (
              <div className="p-8 text-center">
                <p className="text-sm text-gray-600">
                  Complete the evaluation on the{' '}
                  <a href="/sobre-b" className="text-[#A81B0F] hover:underline font-medium">Sobre B tab</a>
                  {' '}and enter all scores to see the combined ranking.
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
