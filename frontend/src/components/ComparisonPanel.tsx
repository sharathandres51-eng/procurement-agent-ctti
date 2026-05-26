/**
 * ComparisonPanel
 * ---------------
 * Fetches a cross-supplier comparison from the API once and caches it
 * indefinitely (staleTime: Infinity) so navigating away from Sobre B and
 * back does NOT re-trigger the LLM call.
 *
 * Uses react-markdown to render the response text properly — the LLM
 * often returns **bold headers** and bullet lists.
 */
import ReactMarkdown from 'react-markdown'
import { useQuery } from '@tanstack/react-query'
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

// Tailwind component map for react-markdown — no @tailwindcss/typography needed
const mdComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  p:      ({ children }) => <p className="text-sm text-gray-700 leading-relaxed mb-2 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-gray-800">{children}</strong>,
  em:     ({ children }) => <em className="italic text-gray-600">{children}</em>,
  h1:     ({ children }) => <h1 className="text-base font-bold text-gray-800 mt-3 mb-1">{children}</h1>,
  h2:     ({ children }) => <h2 className="text-sm font-bold text-gray-800 mt-3 mb-1">{children}</h2>,
  h3:     ({ children }) => <h3 className="text-sm font-semibold text-gray-700 mt-2 mb-1">{children}</h3>,
  ul:     ({ children }) => <ul className="list-disc list-inside space-y-0.5 mb-2 text-sm text-gray-700">{children}</ul>,
  ol:     ({ children }) => <ol className="list-decimal list-inside space-y-0.5 mb-2 text-sm text-gray-700">{children}</ol>,
  li:     ({ children }) => <li className="leading-relaxed">{children}</li>,
  code:   ({ children }) => <code className="bg-blue-100 text-blue-800 text-xs font-mono px-1 py-0.5 rounded">{children}</code>,
  hr:     () => <hr className="border-blue-200 my-3" />,
}

export default function ComparisonPanel({
  tenderId,
  criterionId,
  criterionName,
  evidence,
}: ComparisonPanelProps) {
  const { t, i18n } = useTranslation()

  // Key includes language so switching language re-fetches in the new language,
  // but navigating away and back reuses the cached result.
  const { data, isPending, isError } = useQuery({
    queryKey: ['comparison', tenderId, criterionId, i18n.language],
    queryFn:  () =>
      fetchComparison(tenderId, {
        criterion_id:   criterionId,
        criterion_name: criterionName,
        language:       i18n.language,
        evidence,
      }),
    staleTime: Infinity,       // deterministic result — never re-fetch for the same inputs
    gcTime:    1000 * 60 * 30, // keep in cache for 30 min
    retry: 1,
  })

  return (
    <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-4">
      <p className="text-[11px] font-semibold text-[#0057A8] uppercase tracking-wider mb-2">
        🔎 {t('comparison_header', { crit_name: criterionName })}
      </p>

      {isPending && (
        <div className="flex items-center gap-2">
          <Spinner />
          <span className="text-xs text-gray-500">
            {t('comparison_spinner', { crit_name: criterionName })}
          </span>
        </div>
      )}

      {isError && (
        <p className="text-xs text-red-500">{t('comparison_unavailable')}</p>
      )}

      {data && (
        <ReactMarkdown components={mdComponents}>
          {data.comparison_text}
        </ReactMarkdown>
      )}
    </div>
  )
}
