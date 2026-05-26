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

  // Plan is needed for computing Sobre B totals — already cached by React Query
  const { data: plan } = useQuery({
    queryKey: ['plan', tender.tender_id],
    queryFn: () => fetchPlan(tender.tender_id),
    enabled: !!results, // only fetch if evaluation has been run
  })

  if (isLoading) return <Spinner label="Loading Sobre C scores…" />
  if (error)     return <p className="text-red-400 text-sm">Failed to load Sobre C data.</p>
  if (!data)     return null

  const supplierIds    = Object.keys(data.results)
  const firstSupplier  = data.results[supplierIds[0]]
  const criteriaFields = Object.keys(firstSupplier?.criteria ?? {})
  const maxSobreC      = criteriaFields.reduce(
    (sum, f) => sum + (firstSupplier?.criteria[f]?.max_points ?? 0), 0
  )

  // ── Sobre B helpers ──────────────────────────────────────────────────────────

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

  // ── Winners ──────────────────────────────────────────────────────────────────

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
    <div className="space-y-8 max-w-5xl">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">{t('sobre_c_title')}</h1>
        <p className="text-sm text-slate-400 mt-1">{tender.label}</p>
      </div>

      {/* Info */}
      <div className="p-4 bg-blue-900/20 border border-blue-700/40 rounded-lg text-sm text-blue-300">
        ℹ️ {t('sobre_c_info')}
      </div>

      {/* ── Declared values ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
          {t('declared_subheader')}
        </h2>
        <div className="rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800 text-slate-400 uppercase tracking-wider">
                <th className="text-left px-4 py-2">{t('supplier_col')}</th>
                {criteriaFields.map(f => (
                  <th key={f} className="text-right px-4 py-2">
                    {firstSupplier?.criteria[f]?.label ?? f}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {supplierIds.map(sid => (
                <tr key={sid} className="bg-slate-900 hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-2.5 text-slate-200 font-medium">
                    {data.results[sid].name}
                  </td>
                  {criteriaFields.map(f => (
                    <td key={f} className="px-4 py-2.5 text-right text-slate-300 font-mono">
                      {String(data.results[sid].declared[f] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Score breakdown ───────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-1">
          {t('breakdown_subheader')}
        </h2>
        <p className="text-xs text-slate-500 mb-3">{t('breakdown_caption')}</p>
        <div className="rounded-lg border border-slate-700 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800 text-slate-400 uppercase tracking-wider">
                <th className="text-left px-4 py-2">{t('supplier_col')}</th>
                {criteriaFields.map(f => (
                  <th key={f} className="text-right px-4 py-2">
                    {firstSupplier?.criteria[f]?.label ?? f}
                    <span className="text-slate-600 normal-case font-normal">
                      {' '}/ {firstSupplier?.criteria[f]?.max_points}
                    </span>
                  </th>
                ))}
                <th className="text-right px-4 py-2 text-slate-300">
                  Total
                  <span className="text-slate-600 font-normal"> / {maxSobreC}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {supplierIds.map(sid => (
                <tr
                  key={sid}
                  className={`transition-colors ${
                    sid === sobreCWinner ? 'bg-green-900/20' : 'bg-slate-900 hover:bg-slate-800/50'
                  }`}
                >
                  <td className="px-4 py-2.5 text-slate-200 font-medium">
                    {data.results[sid].name}
                    {sid === sobreCWinner && (
                      <span className="ml-2 text-green-400 text-xs">★ Sobre C</span>
                    )}
                  </td>
                  {criteriaFields.map(f => (
                    <td key={f} className="px-4 py-2.5 text-right text-slate-300 font-mono">
                      {data.results[sid].criteria[f]?.score?.toFixed(2) ?? '—'}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right font-bold text-amber-400 font-mono">
                    {data.results[sid].total.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Combined 100-point final ranking ──────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            {t('ranking_subheader')}
          </h2>
          {!sobreBReady && (
            <span className="text-xs text-amber-500 italic">
              ⚠️ {t('ranking_warning')}
            </span>
          )}
        </div>

        {sobreBReady ? (
          <>
            <div className="rounded-lg border border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800 text-slate-400 text-xs uppercase tracking-wider">
                    <th className="text-left px-4 py-2">{t('supplier_col')}</th>
                    <th className="text-right px-4 py-2">
                      {t('sobre_b_col', { max: Math.round(maxSobreB) })}
                    </th>
                    <th className="text-right px-4 py-2">{t('sobre_c_col')}</th>
                    <th className="text-right px-4 py-2">{t('combined_col')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
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
                          i === 0 ? 'bg-amber-500/5' : 'bg-slate-900 hover:bg-slate-800/50'
                        }`}
                      >
                        <td className="px-4 py-3 text-slate-200 font-medium">
                          {i === 0 && <span className="mr-2">🏆</span>}
                          {row.name}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-300 font-mono">
                          {row.sobreB.toFixed(1)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-300 font-mono">
                          {row.sobreC.toFixed(2)}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold font-mono ${
                          i === 0 ? 'text-amber-400 text-base' : 'text-slate-300'
                        }`}>
                          {row.combined.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>

            <div className="mt-3 p-3 bg-green-900/20 border border-green-700/40 rounded-lg text-sm text-green-300">
              🏆 {t('ranking_winner', {
                name:  combinedWinner ? data.results[combinedWinner].name : '—',
                total: combinedWinner
                  ? (sobreBTotal(combinedWinner) + data.results[combinedWinner].total).toFixed(2)
                  : '—',
              })}
            </div>
            <p className="text-xs text-slate-500 italic mt-2">{t('ranking_caption')}</p>
          </>
        ) : (
          <div className="p-6 bg-slate-800/40 border border-slate-700 rounded-lg text-center">
            <p className="text-sm text-slate-400">
              Complete the evaluation on the{' '}
              <a href="/" className="text-amber-400 hover:underline">Dashboard tab</a>
              {' '}and enter all scores to see the combined ranking.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
