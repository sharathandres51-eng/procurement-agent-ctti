import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchAuditEntries, exportAuditUrl } from '../api/audit'
import Spinner from '../components/Spinner'
import type { AuditEntry, TenderSummary, CriterionResult, SubCriteriaResults } from '../types'

interface AuditLogProps {
  tenders: TenderSummary[]
}

// ── helpers ──────────────────────────────────────────────────────────────────

function supplierName(
  supplierId: string,
  tenders: TenderSummary[],
  entry: AuditEntry,
): string {
  // Try to match against the tender whose contract label matches entry.tender_label
  const tender = tenders.find(
    t => t.label === entry.tender_label || t.tender_id === entry.contract.toLowerCase().replace(/-/g, '_'),
  )
  return tender?.suppliers.find(s => s.id === supplierId)?.name ?? supplierId
}

function scoreTotal(critScores: Record<string, number | Record<string, number>>): number {
  return Object.values(critScores).reduce<number>((sum, v) => {
    if (typeof v === 'number') return sum + v
    if (typeof v === 'object' && v !== null)
      return sum + Object.values(v as Record<string, number>).reduce<number>((s, n) => s + (n ?? 0), 0)
    return sum
  }, 0)
}

// ── Evidence accordion ───────────────────────────────────────────────────────

interface EvidencePanelProps {
  evidence: Record<string, unknown>
  tenders: TenderSummary[]
  entry: AuditEntry
}

function EvidencePanel({ evidence, tenders, entry }: EvidencePanelProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const supplierEntries = Object.entries(evidence)
  if (supplierEntries.length === 0) return null

  return (
    <div className="border-t border-slate-700">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-slate-200 uppercase tracking-wider transition-colors text-left"
      >
        <span>🔍 {t('audit_evidence_header')}</span>
        <span className="text-slate-600">{open ? '▲ hide' : '▼ expand'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {supplierEntries.map(([sid, criteriaRaw]) => {
            const criteria = criteriaRaw as Record<string, unknown>
            const sName = supplierName(sid, tenders, entry)

            return (
              <div key={sid}>
                <p className="text-xs font-semibold text-slate-300 mb-2">{sName}</p>
                <div className="space-y-2">
                  {Object.entries(criteria).map(([cid, resultRaw]) => {
                    // Sub-criteria branch
                    if (
                      typeof resultRaw === 'object' &&
                      resultRaw !== null &&
                      (resultRaw as SubCriteriaResults).has_subcriteria
                    ) {
                      const sub = resultRaw as SubCriteriaResults
                      return (
                        <div key={cid} className="pl-2 border-l-2 border-slate-700">
                          <p className="text-xs text-slate-500 font-medium mb-1">
                            {sub.criterion_name ?? cid}
                          </p>
                          {Object.entries(sub.subcriteria ?? {}).map(([scid, scResult]) => {
                            const r = scResult as CriterionResult
                            return (
                              <div key={scid} className="mb-2 pl-2">
                                <p className="text-xs text-slate-500 italic mb-0.5">{scid}</p>
                                {r.evidence && (
                                  <p className="text-xs text-slate-400">
                                    <span className="text-slate-500">{t('evidence_prefix')}: </span>
                                    {r.evidence}
                                  </p>
                                )}
                                {r.agent_note && (
                                  <p className="text-xs text-slate-500 italic mt-0.5">
                                    ⚙ {r.agent_note}
                                  </p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    }

                    // Leaf criterion
                    const r = resultRaw as CriterionResult
                    if (!r) return null
                    return (
                      <div key={cid} className="pl-2 border-l-2 border-slate-700">
                        <p className="text-xs text-slate-500 font-medium mb-0.5">
                          {r.criterion_name ?? cid}
                        </p>
                        {r.evidence && (
                          <p className="text-xs text-slate-400">
                            <span className="text-slate-500">{t('evidence_prefix')}: </span>
                            {r.evidence}
                          </p>
                        )}
                        {r.agent_note && (
                          <p className="text-xs text-slate-500 italic mt-0.5">⚙ {r.agent_note}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AuditLog({ tenders }: AuditLogProps) {
  const { t } = useTranslation()

  const { data: entries, isLoading, error } = useQuery({
    queryKey: ['audit'],
    queryFn: fetchAuditEntries,
  })

  if (isLoading) return <Spinner label="Loading audit log…" />
  if (error) return <p className="text-red-400 text-sm">Failed to load audit log.</p>

  // Derive column headers from the first entry's first supplier scores
  const criteriaColumns = (entry: AuditEntry): string[] =>
    Object.keys(Object.values(entry.scores)[0] ?? {})

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
            {t('audit_export_btn')}
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

          {entries.map((entry, i) => {
            const cols = criteriaColumns(entry)

            return (
              <div key={i} className="bg-slate-800/40 border border-slate-700 rounded-lg overflow-hidden">

                {/* ── Entry header ──────────────────────────────────────────── */}
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

                {/* ── Regulatory note ───────────────────────────────────────── */}
                <div className="px-4 py-2 bg-slate-900/50 border-b border-slate-700">
                  <p className="text-xs text-slate-500 italic">📋 {entry.regulatory_note}</p>
                </div>

                {/* ── Scores table ──────────────────────────────────────────── */}
                <div className="p-4">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    {t('audit_scores_header')}
                  </p>
                  <div className="rounded border border-slate-700 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-800 text-slate-500 uppercase tracking-wider">
                          <th className="text-left px-3 py-1.5">{t('supplier_col')}</th>
                          {cols.map(cid => (
                            <th key={cid} className="text-right px-3 py-1.5">{cid}</th>
                          ))}
                          <th className="text-right px-3 py-1.5">{t('audit_total_col')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {Object.entries(entry.scores).map(([sid, critScores]) => {
                          const total = scoreTotal(critScores)
                          return (
                            <tr key={sid} className="bg-slate-900 hover:bg-slate-800/50 transition-colors">
                              <td className="px-3 py-1.5 text-slate-300">
                                {supplierName(sid, tenders, entry)}
                              </td>
                              {cols.map(cid => {
                                const v = critScores[cid]
                                const display =
                                  typeof v === 'number'
                                    ? String(v)
                                    : typeof v === 'object' && v !== null
                                    ? Object.values(v as Record<string, number>)
                                        .reduce((s, n) => s + (n ?? 0), 0)
                                        .toFixed(1)
                                    : '—'
                                return (
                                  <td key={cid} className="px-3 py-1.5 text-right text-slate-400 font-mono">
                                    {display}
                                  </td>
                                )
                              })}
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

                {/* ── Evidence accordion ────────────────────────────────────── */}
                <EvidencePanel
                  evidence={entry.evidence}
                  tenders={tenders}
                  entry={entry}
                />

              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
