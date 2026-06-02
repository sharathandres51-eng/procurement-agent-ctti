/**
 * SobreA.tsx
 * ----------
 * Administrative qualification checklist (Sobre A).
 * Each supplier must pass all 5 standard PCAP criteria before
 * proceeding to Sobre B (qualitative) and Sobre C (economic) scoring.
 *
 * State is lifted to App so exclusion status is visible app-wide.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TenderSummary, SobreAState, SobreACheck } from '../types'

// ── Standard PCAP Sobre A criteria (fixed, applies to all tenders) ────────────

interface SobreACriterion {
  id: string
  labelKey: string
  descKey: string
}

const SOBRE_A_CRITERIA: SobreACriterion[] = [
  { id: 'capacitat_obrar',        labelKey: 'soa_capacitat_obrar',        descKey: 'soa_capacitat_obrar_desc' },
  { id: 'no_prohibicio',          labelKey: 'soa_no_prohibicio',          descKey: 'soa_no_prohibicio_desc' },
  { id: 'solvencia_economica',    labelKey: 'soa_solvencia_economica',    descKey: 'soa_solvencia_economica_desc' },
  { id: 'solvencia_tecnica',      labelKey: 'soa_solvencia_tecnica',      descKey: 'soa_solvencia_tecnica_desc' },
  { id: 'declaracio_responsable', labelKey: 'soa_declaracio_responsable', descKey: 'soa_declaracio_responsable_desc' },
]

// ── Helpers (exported — App uses these to filter who proceeds to Sobre B/C) ────

// A supplier is admitted only when all 5 criteria are explicitly marked pass.
// Suppliers left blank or with any fail are simply not admitted and do not
// proceed to Sobre B / Sobre C.
export function supplierStatus(
  supplierId: string,
  sobreA: SobreAState,
): 'admitted' | 'excluded' | 'pending' {
  const checks = sobreA[supplierId] ?? {}
  if (SOBRE_A_CRITERIA.some(c => checks[c.id] === false)) return 'excluded'
  if (SOBRE_A_CRITERIA.every(c => checks[c.id] === true))  return 'admitted'
  return 'pending'
}

export function admittedSupplierIds(
  sobreA: SobreAState,
  suppliers: TenderSummary['suppliers'],
): string[] {
  return suppliers.filter(s => supplierStatus(s.id, sobreA) === 'admitted').map(s => s.id)
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface SobreAProps {
  tender: TenderSummary
  sobreA: SobreAState
  sobreALocked: boolean
  onUpdate: (sobreA: SobreAState, locked: boolean) => void
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SobreA({ tender, sobreA, sobreALocked, onUpdate }: SobreAProps) {
  const { t } = useTranslation()
  const [evaluatorId, setEvaluatorId] = useState('')

  // Toggle a single cell: null → true → false → null
  const toggleCheck = (supplierId: string, criterionId: string) => {
    if (sobreALocked) return
    const current: SobreACheck = sobreA[supplierId]?.[criterionId] ?? null
    const next: SobreACheck = current === null ? true : current === true ? false : null
    const updated: SobreAState = {
      ...sobreA,
      [supplierId]: { ...(sobreA[supplierId] ?? {}), [criterionId]: next },
    }
    onUpdate(updated, false)
  }

  // Mark all criteria for a supplier as pass
  const passAll = (supplierId: string) => {
    if (sobreALocked) return
    const updated: SobreAState = {
      ...sobreA,
      [supplierId]: Object.fromEntries(SOBRE_A_CRITERIA.map(c => [c.id, true])),
    }
    onUpdate(updated, false)
  }

  const admittedSuppliers = tender.suppliers.filter(
    s => supplierStatus(s.id, sobreA) === 'admitted'
  )
  const canLock = !!evaluatorId && admittedSuppliers.length > 0

  const handleLock = () => {
    if (!canLock) return
    onUpdate(sobreA, true)
  }

  const excludedSuppliers = tender.suppliers.filter(
    s => supplierStatus(s.id, sobreA) === 'excluded'
  )

  return (
    <div className="space-y-6 max-w-7xl">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">{t('sobre_a_title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{tender.label}</p>
      </div>

      {/* Info banner */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
        ℹ️ {t('sobre_a_info')}
      </div>

      {/* Admitted suppliers preview (who proceeds to Sobre B / C) */}
      {!sobreALocked && admittedSuppliers.length > 0 && (
        <div className="p-3 bg-[#A81B0F]/5 border border-[#A81B0F]/20 rounded-xl text-sm text-gray-700 flex items-start gap-2">
          <span className="text-[#A81B0F]">→</span>
          <span>
            {t('sobre_a_admitted_preview', {
              count: admittedSuppliers.length,
              names: admittedSuppliers.map(s => s.name).join(', '),
            })}
          </span>
        </div>
      )}

      {/* Locked banner */}
      {sobreALocked && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 flex items-center gap-2">
          <span>🔒</span>
          <span>{t('sobre_a_locked_banner', { evaluator: evaluatorId || '-' })}</span>
        </div>
      )}

      {/* Excluded warning */}
      {excludedSuppliers.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-1">
          {excludedSuppliers.map(s => (
            <p key={s.id} className="text-sm text-red-700">
              ⛔ {t('sobre_a_excluded_warning', { name: s.name })}
            </p>
          ))}
        </div>
      )}

      {/* ── Step 1: Review documents ──────────────────────────────────────────── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider border-l-4 border-[#A81B0F] pl-3">
            {t('sobre_a_step1')}
          </h2>
          <p className="text-xs text-gray-500 mt-1 pl-3.5">{t('sobre_a_step1_caption')}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider w-56">
                  {t('supplier_col')}
                </th>
                {SOBRE_A_CRITERIA.map(c => (
                  <th key={c.id} className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    <span className="block">{t(c.labelKey)}</span>
                    <span className="text-[10px] text-gray-400 normal-case font-normal block mt-0.5">
                      {t(c.descKey)}
                    </span>
                  </th>
                ))}
                <th className="text-center px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  {t('sobre_a_status_col')}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {tender.suppliers.map(supplier => {
                const status = supplierStatus(supplier.id, sobreA)
                return (
                  <tr
                    key={supplier.id}
                    className={`transition-colors ${
                      status === 'excluded'
                        ? 'bg-red-50'
                        : status === 'admitted'
                        ? 'bg-green-50/40'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Supplier name + quick-pass button */}
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-800">{supplier.name}</p>
                      {!sobreALocked && status !== 'admitted' && (
                        <button
                          onClick={() => passAll(supplier.id)}
                          className="mt-1 text-[10px] text-[#A81B0F] hover:underline"
                        >
                          ✓ {t('sobre_a_pass_all')}
                        </button>
                      )}
                    </td>

                    {/* One cell per criterion */}
                    {SOBRE_A_CRITERIA.map(c => {
                      const val: SobreACheck = sobreA[supplier.id]?.[c.id] ?? null
                      return (
                        <td key={c.id} className="text-center px-4 py-4">
                          <button
                            onClick={() => toggleCheck(supplier.id, c.id)}
                            disabled={sobreALocked}
                            title={val === null ? t('sobre_a_not_reviewed') : val ? t('sobre_a_pass') : t('sobre_a_fail')}
                            className={`w-9 h-9 rounded-lg border-2 text-base font-bold transition-all disabled:cursor-default ${
                              val === true
                                ? 'bg-green-100 border-green-400 text-green-700'
                                : val === false
                                ? 'bg-red-100 border-red-400 text-red-700'
                                : 'bg-gray-50 border-gray-200 text-gray-300 hover:border-gray-400'
                            }`}
                          >
                            {val === true ? '✓' : val === false ? '✗' : '·'}
                          </button>
                        </td>
                      )
                    })}

                    {/* Status badge */}
                    <td className="text-center px-6 py-4">
                      {status === 'admitted' && (
                        <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-semibold px-3 py-1 rounded-full">
                          ✓ {t('sobre_a_status_pass')}
                        </span>
                      )}
                      {status === 'excluded' && (
                        <span className="inline-flex items-center gap-1 bg-red-100 text-red-700 text-xs font-semibold px-3 py-1 rounded-full">
                          ✗ {t('sobre_a_status_fail')}
                        </span>
                      )}
                      {status === 'pending' && (
                        <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-500 text-xs font-medium px-3 py-1 rounded-full">
                          {t('sobre_a_status_pending')}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Step 2: Criteria legend ───────────────────────────────────────────── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider border-l-4 border-[#A81B0F] pl-3 mb-4">
          {t('sobre_a_step2')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SOBRE_A_CRITERIA.map(c => (
            <div key={c.id} className="flex gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
              <div className="shrink-0 mt-0.5 w-5 h-5 rounded bg-[#A81B0F]/10 flex items-center justify-center">
                <span className="text-[10px] font-bold text-[#A81B0F]">
                  {SOBRE_A_CRITERIA.indexOf(c) + 1}
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-800">{t(c.labelKey)}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t(c.descKey)}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Step 3: Lock & Sign ───────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider border-l-4 border-[#A81B0F] pl-3 mb-4">
          {t('sobre_a_step3')}
        </h2>

        {sobreALocked ? (
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
            <span className="text-2xl">🔒</span>
            <div>
              <p className="text-sm font-semibold text-green-700">{t('sobre_a_locked_title')}</p>
              <p className="text-xs text-green-600 mt-0.5">{t('sobre_a_locked_caption')}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 max-w-md">
            {admittedSuppliers.length === 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                ⚠️ {t('sobre_a_none_admitted_warning')}
              </p>
            )}
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t('evaluator_label')}</label>
              <input
                type="text"
                placeholder={t('evaluator_placeholder')}
                value={evaluatorId}
                onChange={e => setEvaluatorId(e.target.value)}
                className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#A81B0F]"
              />
            </div>
            <p className="text-xs text-gray-400">{t('sobre_a_sign_caption')}</p>
            <button
              disabled={!canLock}
              onClick={handleLock}
              className="bg-[#A81B0F] hover:bg-[#8A160C] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm px-5 py-2 rounded-md transition-colors"
            >
              🔒 {t('sobre_a_lock_btn')}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
