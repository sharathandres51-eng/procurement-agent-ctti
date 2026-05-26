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
        <p className="text-sm font-semibold text-white truncate">{result.supplier_name}</p>
        {isScored ? (
          <span className="flex items-center gap-1 text-[10px] text-green-400 font-medium">
            <CheckCircle size={11} />
            {t('scored_label', { score, max: maxPoints })}
          </span>
        ) : (
          <span className="text-[10px] text-amber-500/70 italic">{t('not_scored_label')}</span>
        )}
      </div>

      {/* Amber evidence box */}
      <div className="bg-[#2d1f00] border border-amber-500/50 rounded-lg p-3">
        <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1.5">
          {t('evidence_label')}
        </p>
        <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap line-clamp-6">
          {result.evidence}
        </p>
        <p className="text-[10px] text-slate-400 italic mt-2 leading-snug">
          ⚠️ {result.agent_note}
        </p>
      </div>

      {/* Score input */}
      <div className={`flex items-center gap-2 p-2 rounded-md border transition-colors ${
        isScored
          ? 'bg-green-900/20 border-green-700/50'
          : 'bg-slate-800/60 border-slate-600 border-dashed'
      }`}>
        <label className="text-xs text-slate-400 whitespace-nowrap flex-1">
          Score <span className="text-slate-600">(0 – {maxPoints})</span>
        </label>
        <input
          type="number"
          min={0}
          max={maxPoints}
          step={Number.isInteger(maxPoints) ? 1 : 0.5}
          value={score ?? ''}
          placeholder="—"
          onChange={e => {
            const raw = e.target.value
            if (raw === '') return
            const v = parseFloat(raw)
            if (!isNaN(v)) onScoreChange(Math.min(maxPoints, Math.max(0, v)))
          }}
          className={`w-16 text-sm text-right rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-colors ${
            isScored
              ? 'bg-green-900/40 border border-green-700 text-green-300 font-bold'
              : 'bg-slate-700 border border-slate-600 text-slate-300'
          }`}
        />
      </div>
    </div>
  )
}
