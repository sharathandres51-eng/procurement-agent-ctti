import type { EvaluationPlan } from '../types'

interface PlanTableProps {
  plan: EvaluationPlan
}

export default function PlanTable({ plan }: PlanTableProps) {
  return (
    <div className="rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#A81B0F] text-white uppercase tracking-wider">
            <th className="text-left px-4 py-2">Criterion</th>
            <th className="text-right px-4 py-2">Max pts</th>
            <th className="text-left px-4 py-2">Sub-criteria</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {plan.criteria.map(c => (
            <tr
              key={c.id}
              className="bg-white hover:bg-gray-50 transition-colors border-l-4 border-transparent hover:border-[#A81B0F]"
            >
              <td className="px-4 py-3 text-gray-800 font-medium">{c.name}</td>
              <td className="px-4 py-3 text-right">
                <span className="bg-[#A81B0F]/10 text-[#A81B0F] font-mono font-bold text-sm rounded-full px-2 py-0.5">
                  {c.max_points}
                </span>
              </td>
              <td className="px-4 py-3">
                {c.has_subcriteria ? (
                  <div className="space-y-0.5">
                    {c.subcriteria.map(sc => (
                      <div key={sc.id} className="flex justify-between gap-4">
                        <span className="text-gray-500">{sc.name}</span>
                        <span className="text-gray-400 font-mono shrink-0">{sc.points} pts</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-gray-400 italic">flat criterion</span>
                )}
              </td>
            </tr>
          ))}
          <tr className="bg-gray-50 border-t-2 border-gray-200">
            <td className="px-4 py-2 text-gray-500 font-semibold">Total Sobre B</td>
            <td className="px-4 py-2 text-right font-bold text-[#A81B0F] font-mono">
              {plan.criteria.reduce((s, c) => s + c.max_points, 0)}
            </td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  )
}
