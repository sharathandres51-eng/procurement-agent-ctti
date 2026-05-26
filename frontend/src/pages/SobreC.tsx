import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchSobreC } from '../api/sobreC'
import { fetchPlan } from '../api/tenders'
import Spinner from '../components/Spinner'
import type { TenderSummary, TenderEvalState } from '../types'

interface SobreCProps {
  tender: TenderSummary
  evalState: TenderEvalState
}

export default function SobreC({ tender, evalState }: SobreCProps) {
  const { t } = useTranslation()
  const { results, scores } = evalState

  const { data, isLoading, error } = useQuery({
    queryKey: ['sobre-c', tender.tender_id],
    queryFn: () => fetchSobreC(tender.tender_id),
  })

  const { data: plan } = useQuery({
    queryKey: ['plan', tender.tender_id],
    queryFn: () => fetchPlan(tender.tender_id),
    enabled: !!results,
  })

  if (isLoading) return <Spinner label="Loading Sobre C scores…" />
  if (error)     return <p className="text-red-500 text-sm">Failed to load Sobre C data.</p>
  if (!data)     return null

  const supplierIds    = Object.keys(data.results)
  const firstSupplier  = data.results[supplierIds[0]]
  const criteriaFields = Object.keys(firstSupplier?.criteria ?? {})
  const maxSobreC      = criteriaFields.reduce(
    (sum, f) => sum + (firstSupplier?.criteria[f]?.max_points ?? 0), 0
  )

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

  const sobreCWinner = supplierIds.reduce((best, sid) =>
    data.results[sid].total > data.results[best].total ? sid : best, supplierIds[0]
  )

  const combinedWinner = sobreBReady
    ? supplierIds.reduce((best, sid) =>
        (sobreBTotal(sid) + data.results[sid].total) >
        (sobreBTotal(best) + data.results[best].total) ? sid : best,
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

      {/* ── Declared values ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            {t('declared_subheader')}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-400 uppercase tracking-wider">
                <th className="text-left px-6 py-3">{t('supplier_col')}</th>
                {criteriaFields.map(f => (
                  <th key={f} className="text-right px-6 py-3">
                    {firstSupplier?.criteria[f]?.label ?? f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {supplierIds.map(sid => (
                <tr key={sid} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3 text-gray-800 font-medium">
                    {data.results[sid].name}
                  </td>
                  {criteriaFields.map(f => (
                    <td key={f} className="px-6 py-3 text-right text-gray-600 font-mono">
                      {String(data.results[sid].declared[f] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Score breakdown ───────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            {t('breakdown_subheader')}
          </h2>
          <p className="text-xs text-gray-400 mt-1">{t('breakdown_caption')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-400 uppercase tracking-wider">
                <th className="text-left px-6 py-3">{t('supplier_col')}</th>
                {criteriaFields.map(f => (
                  <th key={f} className="text-right px-6 py-3">
                    {firstSupplier?.criteria[f]?.label ?? f}
                    <span className="text-gray-300 normal-case font-normal">
                      {' '}/ {firstSupplier?.criteria[f]?.max_points}
                    </span>
                  </th>
                ))}
                <th className="text-right px-6 py-3 text-gray-600">
                  Total
                  <span className="text-gray-300 font-normal"> / {maxSobreC}</span>
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
                    {data.results[sid].name}
                    {sid === sobreCWinner && (
                      <span className="ml-2 text-green-600 text-xs font-semibold">★ Sobre C</span>
                    )}
                  </td>
                  {criteriaFields.map(f => (
                    <td key={f} className="px-6 py-3 text-right text-gray-600 font-mono">
                      {data.results[sid].criteria[f]?.score?.toFixed(2) ?? '—'}
                    </td>
                  ))}
                  <td className="px-6 py-3 text-right font-bold text-[#0057A8] font-mono">
                    {data.results[sid].total.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Combined final ranking ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
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
                  <tr className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wider">
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
                      sobreC:   data.results[sid].total,
                      combined: sobreBTotal(sid) + data.results[sid].total,
                      name:     data.results[sid].name,
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
                          i === 0 ? 'text-[#0057A8] text-base' : 'text-gray-600'
                        }`}>
                          {row.combined.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>

            <div className="mx-6 mb-4 mt-3 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
              🏆 {t('ranking_winner', {
                name:  combinedWinner ? data.results[combinedWinner].name : '—',
                total: combinedWinner
                  ? (sobreBTotal(combinedWinner) + data.results[combinedWinner].total).toFixed(2)
                  : '—',
              })}
            </div>
            <p className="text-xs text-gray-400 italic px-6 pb-4">{t('ranking_caption')}</p>
          </>
        ) : (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-400">
              Complete the evaluation on the{' '}
              <a href="/" className="text-[#0057A8] hover:underline font-medium">Dashboard tab</a>
              {' '}and enter all scores to see the combined ranking.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
