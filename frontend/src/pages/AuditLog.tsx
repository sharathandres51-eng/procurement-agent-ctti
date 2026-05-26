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
    <div className="border-t border-gray-100">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-3 text-xs font-semibold text-gray-600 hover:text-gray-800 uppercase tracking-wider transition-colors text-left"
      >
        <span>🔍 {t('audit_evidence_header')}</span>
        <span className="text-gray-400 normal-case font-normal">{open ? '▲ hide' : '▼ expand'}</span>
      </button>

      {open && (
        <div className="px-6 pb-6 space-y-5">
          {supplierEntries.map(([sid, criteriaRaw]) => {
            const criteria = criteriaRaw as Record<string, unknown>
            const sName = supplierName(sid, tenders, entry)

            return (
              <div key={sid}>
                <p className="text-xs font-semibold text-gray-700 mb-2">{sName}</p>
                <div className="space-y-2">
                  {Object.entries(criteria).map(([cid, resultRaw]) => {
                    if (
                      typeof resultRaw === 'object' &&
                      resultRaw !== null &&
                      (resultRaw as SubCriteriaResults).has_subcriteria
                    ) {
                      const sub = resultRaw as SubCriteriaResults
                      return (
                        <div key={cid} className="pl-3 border-l-2 border-gray-200">
                          <p className="text-xs text-gray-500 font-medium mb-1">
                            {sub.criterion_name ?? cid}
                          </p>
                          {Object.entries(sub.subcriteria ?? {}).map(([scid, scResult]) => {
                            const r = scResult as CriterionResult
                            return (
                              <div key={scid} className="mb-2 pl-2">
                                <p className="text-xs text-gray-500 italic mb-0.5">{scid}</p>
                                {r.evidence && (
                                  <p className="text-xs text-gray-600">
                                    <span className="text-gray-500 font-medium">{t('evidence_prefix')}: </span>
                                    {r.evidence}
                                  </p>
                                )}
                                {r.agent_note && (
                                  <p className="text-xs text-gray-500 italic mt-0.5">
                                    ⚙ {r.agent_note}
                                  </p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    }

                    const r = resultRaw as CriterionResult
                    if (!r) return null
                    return (
                      <div key={cid} className="pl-3 border-l-2 border-gray-200">
                        <p className="text-xs text-gray-500 font-medium mb-0.5">
                          {r.criterion_name ?? cid}
                        </p>
                        {r.evidence && (
                          <p className="text-xs text-gray-600">
                            <span className="text-gray-500 font-medium">{t('evidence_prefix')}: </span>
                            {r.evidence}
                          </p>
                        )}
                        {r.agent_note && (
                          <p className="text-xs text-gray-500 italic mt-0.5">⚙ {r.agent_note}</p>
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
  if (error) return <p className="text-red-500 text-sm">Failed to load audit log.</p>

  const criteriaColumns = (entry: AuditEntry): string[] =>
    Object.keys(Object.values(entry.scores)[0] ?? {})

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('audit_title')}</h1>
          <p className="text-sm text-gray-500 mt-1">{t('audit_caption')}</p>
        </div>
        {entries && entries.length > 0 && (
          <a
            href={exportAuditUrl}
            download
            className="text-xs bg-white hover:bg-gray-50 border border-gray-200 text-gray-600 px-4 py-2 rounded-lg transition-colors shadow-sm"
          >
            {t('audit_export_btn')}
          </a>
        )}
      </div>

      {!entries || entries.length === 0 ? (
        <div className="p-8 bg-white border border-gray-100 rounded-xl shadow-sm text-sm text-gray-400 text-center">
          {t('audit_empty')}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-gray-500">
            {t('audit_export_caption', { count: entries.length })}
          </p>

          {entries.map((entry, i) => {
            const cols = criteriaColumns(entry)

            return (
              <div key={i} className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">

                {/* ── Entry header ──────────────────────────────────────────── */}
                <div className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-gray-100 bg-gray-50">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Evaluator</p>
                    <p className="text-sm text-gray-900 font-medium">{entry.evaluator_id}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Timestamp</p>
                    <p className="text-sm text-gray-600">{new Date(entry.timestamp).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Contract</p>
                    <p className="text-sm text-gray-600">{entry.tender_label ?? entry.contract}</p>
                  </div>
                </div>

                {/* ── Regulatory note ───────────────────────────────────────── */}
                <div className="px-6 py-2 bg-blue-50 border-b border-blue-100">
                  <p className="text-xs text-blue-500 italic">📋 {entry.regulatory_note}</p>
                </div>

                {/* ── Scores table ──────────────────────────────────────────── */}
                <div className="p-6">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
                    {t('audit_scores_header')}
                  </p>
                  <div className="rounded-lg border border-gray-100 overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-gray-600 uppercase tracking-wider">
                          <th className="text-left px-4 py-2">{t('supplier_col')}</th>
                          {cols.map(cid => (
                            <th key={cid} className="text-right px-4 py-2">{cid}</th>
                          ))}
                          <th className="text-right px-4 py-2 text-gray-600">{t('audit_total_col')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {Object.entries(entry.scores).map(([sid, critScores]) => {
                          const total = scoreTotal(critScores)
                          return (
                            <tr key={sid} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-2 text-gray-700 font-medium">
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
                                    : '-'
                                return (
                                  <td key={cid} className="px-4 py-2 text-right text-gray-500 font-mono">
                                    {display}
                                  </td>
                                )
                              })}
                              <td className="px-4 py-2 text-right text-[#0057A8] font-mono font-bold">
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
