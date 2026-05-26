import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchSobreC } from '../api/sobreC'
import Spinner from '../components/Spinner'
import type { TenderSummary } from '../types'

interface SobreCProps {
  tender: TenderSummary
}

export default function SobreC({ tender }: SobreCProps) {
  const { t } = useTranslation()

  const { data, isLoading, error } = useQuery({
    queryKey: ['sobre-c', tender.tender_id],
    queryFn: () => fetchSobreC(tender.tender_id),
  })

  if (isLoading) return <Spinner label="Loading Sobre C scores…" />
  if (error) return <p className="text-red-400 text-sm">Failed to load Sobre C data.</p>
  if (!data) return null

  const supplierIds = Object.keys(data.results)
  const firstSupplier = data.results[supplierIds[0]]
  const criteriaFields = Object.keys(firstSupplier?.criteria ?? {})

  const maxSobreC = criteriaFields.reduce(
    (sum, f) => sum + (firstSupplier?.criteria[f]?.max_points ?? 0), 0
  )

  const winner = supplierIds.reduce((best, sid) =>
    data.results[sid].total > data.results[best].total ? sid : best, supplierIds[0]
  )

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-xl font-bold text-white">{t('sobre_c_title')}</h1>
        <p className="text-sm text-slate-400 mt-1">{tender.label}</p>
      </div>

      {/* Info box */}
      <div className="p-4 bg-blue-900/20 border border-blue-700/50 rounded-lg text-sm text-blue-300">
        ℹ️ {t('sobre_c_info')}
      </div>

      {/* Declared values */}
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
                <tr key={sid} className="bg-slate-900">
                  <td className="px-4 py-2 text-slate-200">{data.results[sid].name}</td>
                  {criteriaFields.map(f => (
                    <td key={f} className="px-4 py-2 text-right text-slate-300 font-mono">
                      {String(data.results[sid].declared[f] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Score breakdown */}
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
                    <span className="text-slate-600 normal-case"> /{firstSupplier?.criteria[f]?.max_points}</span>
                  </th>
                ))}
                <th className="text-right px-4 py-2">Total /{maxSobreC}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {supplierIds.map(sid => (
                <tr key={sid} className={`${sid === winner ? 'bg-green-900/20' : 'bg-slate-900'}`}>
                  <td className="px-4 py-2 text-slate-200">
                    {data.results[sid].name}
                    {sid === winner && <span className="ml-2 text-green-400">★</span>}
                  </td>
                  {criteriaFields.map(f => (
                    <td key={f} className="px-4 py-2 text-right text-slate-300 font-mono">
                      {data.results[sid].criteria[f]?.score?.toFixed(2) ?? '—'}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-bold text-amber-400 font-mono">
                    {data.results[sid].total.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Winner */}
      <div className="p-4 bg-green-900/20 border border-green-700/50 rounded-lg text-sm text-green-300">
        🏆 {t('ranking_winner', {
          name: data.results[winner].name,
          total: data.results[winner].total.toFixed(2),
        })}
      </div>

      <p className="text-xs text-slate-500 italic">{t('ranking_caption')}</p>
    </div>
  )
}
