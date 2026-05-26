import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchAuditEntries, exportAuditUrl } from '../api/audit'
import Spinner from '../components/Spinner'

export default function AuditLog() {
  const { t } = useTranslation()

  const { data: entries, isLoading, error } = useQuery({
    queryKey: ['audit'],
    queryFn: fetchAuditEntries,
  })

  if (isLoading) return <Spinner label="Loading audit log…" />
  if (error) return <p className="text-red-400 text-sm">Failed to load audit log.</p>

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">{t('audit_title')}</h1>
          <p className="text-sm text-slate-400 mt-1">{t('audit_caption')}</p>
        </div>
        {entries && entries.length > 0 && (
          <a
            href={exportAuditUrl}
            download
            className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 px-4 py-2 rounded-md transition-colors"
          >
            ⬇ {t('audit_export_btn')}
          </a>
        )}
      </div>

      {!entries || entries.length === 0 ? (
        <div className="p-6 bg-slate-800/40 border border-slate-700 rounded-lg text-sm text-slate-400">
          {t('audit_empty')}
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-xs text-slate-500">
            {t('audit_export_caption', { count: entries.length })}
          </p>

          {entries.map((entry, i) => (
            <div key={i} className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">
              {/* Entry header */}
              <div className="grid grid-cols-3 gap-4 p-4 border-b border-slate-700">
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Evaluator</p>
                  <p className="text-sm text-white font-medium">{entry.evaluator_id}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Timestamp</p>
                  <p className="text-sm text-slate-300">{new Date(entry.timestamp).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider mb-0.5">Contract</p>
                  <p className="text-sm text-slate-300">{entry.tender_label ?? entry.contract}</p>
                </div>
              </div>

              {/* Regulatory note */}
              <div className="px-4 py-2 bg-slate-900/50">
                <p className="text-xs text-slate-500 italic">📋 {entry.regulatory_note}</p>
              </div>

              {/* Scores table */}
              <div className="p-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  {t('audit_scores_header')}
                </p>
                <div className="rounded border border-slate-700 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-800 text-slate-500 uppercase tracking-wider">
                        <th className="text-left px-3 py-1.5">{t('supplier_col')}</th>
                        {Object.keys(Object.values(entry.scores)[0] ?? {}).map(cid => (
                          <th key={cid} className="text-right px-3 py-1.5">{cid}</th>
                        ))}
                        <th className="text-right px-3 py-1.5">{t('audit_total_col')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {Object.entries(entry.scores).map(([sid, critScores]) => {
                        const total = Object.values(critScores).reduce((sum: number, v) => {
                          if (typeof v === 'number') return sum + v
                          if (typeof v === 'object' && v !== null)
                            return sum + Object.values(v as Record<string, number>).reduce((s: number, n: number) => s + n, 0)
                          return sum
                        }, 0)
                        return (
                          <tr key={sid} className="bg-slate-900">
                            <td className="px-3 py-1.5 text-slate-300">{sid}</td>
                            {Object.entries(critScores).map(([cid, v]) => (
                              <td key={cid} className="px-3 py-1.5 text-right text-slate-400 font-mono">
                                {typeof v === 'number'
                                  ? String(v)
                                  : Object.values(v as Record<string, number>).reduce((s: number, n: number) => s + n, 0).toFixed(1)
                                }
                              </td>
                            ))}
                            <td className="px-3 py-1.5 text-right text-amber-400 font-mono font-bold">
                              {total.toFixed(1)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
