import { CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CriterionResult } from '../types'

interface EvidenceCardProps {
  result: CriterionResult
  score: number | null          // null = not yet scored
  maxPoints: number
  onScoreChange: (value: number) => void
}

export default function EvidenceCard({
  result,
  score,
  maxPoints,
  onScoreChange,
}: EvidenceCardProps) {
  const { t } = useTranslation()
  const isScored = score !== null

  return (
    <div className="flex flex-col gap-2.5">

      {/* Supplier name + scored badge */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-800 truncate">{result.supplier_name}</p>
        {isScored ? (
          <span className="flex items-center gap-1 text-[10px] text-green-600 font-medium">
            <CheckCircle size={11} />
            {t('scored_label', { score, max: maxPoints })}
          </span>
        ) : (
          <span className="text-[10px] text-amber-600 italic">{t('not_scored_label')}</span>
        )}
      </div>

      {/* Amber evidence box */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
            🤖 {t('evidence_label')}
          </p>
          <span className="text-[9px] font-semibold text-amber-600 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
            Advisory only
          </span>
        </div>
        <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap line-clamp-6">
          {result.evidence}
        </p>
        <p className="text-[10px] text-gray-500 italic mt-2 leading-snug">
          ⚠️ {result.agent_note}
        </p>
      </div>

      {/* Score input */}
      <div className={`flex items-center gap-2 p-2 rounded-md border transition-colors ${
        isScored
          ? 'bg-green-50 border-green-300'
          : 'bg-gray-50 border-gray-300 border-dashed'
      }`}>
        <label className="text-xs text-gray-500 whitespace-nowrap flex-1">
          Score <span className="text-gray-400">(0 – {maxPoints})</span>
        </label>
        <input
          type="number"
          min={0}
          max={maxPoints}
          step={Number.isInteger(maxPoints) ? 1 : 0.5}
          value={score ?? ''}
          placeholder="-"
          onChange={e => {
            const raw = e.target.value
            if (raw === '') return
            const v = parseFloat(raw)
            if (!isNaN(v)) onScoreChange(Math.min(maxPoints, Math.max(0, v)))
          }}
          className={`w-16 text-sm text-right rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#16A34A] transition-colors ${
            isScored
              ? 'bg-green-100 border border-green-400 text-green-700 font-bold'
              : 'bg-white border border-gray-300 text-gray-700'
          }`}
        />
      </div>
    </div>
  )
}
