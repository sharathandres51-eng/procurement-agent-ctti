/**
 * ComparisonPanel
 * ---------------
 * Auto-fetches a cross-supplier comparison from the API when mounted.
 * Rendered below a criterion's evidence grid once all three suppliers
 * have been scored. Results are cached in React Query so re-renders
 * and language changes don't trigger duplicate API calls.
 */
import { useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchComparison } from '../api/compare'
import Spinner from './Spinner'

interface ComparisonPanelProps {
  tenderId: string
  criterionId: string
  criterionName: string
  /** supplier_id → evidence text */
  evidence: Record<string, string>
}

export default function ComparisonPanel({
  tenderId,
  criterionId,
  criterionName,
  evidence,
}: ComparisonPanelProps) {
  const { t, i18n } = useTranslation()

  const { mutate, data, isPending, isError } = useMutation({
    mutationFn: () =>
      fetchComparison(tenderId, {
        criterion_id: criterionId,
        criterion_name: criterionName,
        language: i18n.language,
        evidence,
      }),
    // Keep the result once fetched — don't re-run on re-render
    onError: () => {},
  })

  // Trigger once on mount
  useEffect(() => {
    mutate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mt-4 bg-[#0f2d1f] border border-green-700/60 rounded-lg p-4">
      <p className="text-[11px] font-bold text-green-400 uppercase tracking-wider mb-2">
        🔎 {t('comparison_header', { crit_name: criterionName })}
      </p>

      {isPending && (
        <div className="flex items-center gap-2">
          <Spinner />
          <span className="text-xs text-slate-400">{t('comparison_spinner', { crit_name: criterionName })}</span>
        </div>
      )}

      {isError && (
        <p className="text-xs text-red-400">{t('comparison_unavailable')}</p>
      )}

      {data && (
        <p className="text-xs text-green-100 leading-relaxed whitespace-pre-wrap">
          {data.comparison_text}
        </p>
      )}
    </div>
  )
}
