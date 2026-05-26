import type { CriterionResult } from '../types'

interface EvidenceCardProps {
  result: CriterionResult
  score: number | null
  maxPoints: number
  onScoreChange: (value: number) => void
}

export default function EvidenceCard({
  result,
  score,
  maxPoints,
  onScoreChange,
}: EvidenceCardProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-white">{result.supplier_name}</p>
      <p className="text-xs text-slate-500">Max {maxPoints} pts</p>

      {/* Amber evidence box */}
      <div className="bg-[#2d1f00] border border-amber-500/60 rounded-lg p-3">
        <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1.5">
          AI Evidence
        </p>
        <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
          {result.evidence}
        </p>
        <p className="text-[10px] text-slate-400 italic mt-2">
          ⚠️ {result.agent_note}
        </p>
      </div>

      {/* Score input */}
      <div className="flex items-center gap-2">
        <label className="text-xs text-slate-400 whitespace-nowrap">
          Score (0–{maxPoints})
        </label>
        <input
          type="number"
          min={0}
          max={maxPoints}
          step={maxPoints % 1 !== 0 ? 0.5 : 1}
          value={score ?? 0}
          onChange={e => onScoreChange(parseFloat(e.target.value) || 0)}
          className="w-20 bg-slate-800 border border-slate-600 text-white text-sm rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
      </div>
    </div>
  )
}
