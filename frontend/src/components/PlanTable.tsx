import type { EvaluationPlan } from '../types'

interface PlanTableProps {
  plan: EvaluationPlan
}

export default function PlanTable({ plan }: PlanTableProps) {
  return (
    <div className="rounded-lg border border-slate-700 overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-800 text-slate-400 uppercase tracking-wider">
            <th className="text-left px-4 py-2">Criterion</th>
            <th className="text-right px-4 py-2">Max pts</th>
            <th className="text-left px-4 py-2">Sub-criteria</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {plan.criteria.map(c => (
            <tr key={c.id} className="bg-slate-900 hover:bg-slate-800/50 transition-colors">
              <td className="px-4 py-3 text-slate-200 font-medium">{c.name}</td>
              <td className="px-4 py-3 text-right text-amber-400 font-mono">{c.max_points}</td>
              <td className="px-4 py-3">
                {c.has_subcriteria ? (
                  <div className="space-y-0.5">
                    {c.subcriteria.map(sc => (
                      <div key={sc.id} className="flex justify-between gap-4">
                        <span className="text-slate-400">{sc.name}</span>
                        <span className="text-slate-500 font-mono shrink-0">{sc.points} pts</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-slate-600 italic">flat criterion</span>
                )}
              </td>
            </tr>
          ))}
          <tr className="bg-slate-800">
            <td className="px-4 py-2 text-slate-400 font-semibold">Total Sobre B</td>
            <td className="px-4 py-2 text-right text-amber-400 font-mono font-semibold">
              {plan.criteria.reduce((s, c) => s + c.max_points, 0)}
            </td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  )
}
