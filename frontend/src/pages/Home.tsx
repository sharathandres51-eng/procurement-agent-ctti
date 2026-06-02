import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ClipboardCheck, Bot, Calculator, ArrowRight } from 'lucide-react'
import type { TenderSummary } from '../types'

interface HomeProps {
  tenders: TenderSummary[]
  onSelectTender: (tenderId: string) => void
}

export default function Home({ tenders, onSelectTender }: HomeProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const openTender = (tenderId: string) => {
    onSelectTender(tenderId)
    navigate('/sobre-a')
  }

  // ── Roadmap content (agents are fixed per envelope) ──────────────────────────
  const stages = [
    {
      key: 'a',
      icon: ClipboardCheck,
      accent: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      bar: 'bg-emerald-500',
      title: t('home_a_title'),
      method: t('home_a_method'),
      desc: t('home_a_desc'),
      agents: [] as { name: string; desc: string }[],
      agentsFallback: t('home_no_agents_human'),
      steps: [t('home_a_step1'), t('home_a_step2'), t('home_a_step3')],
    },
    {
      key: 'b',
      icon: Bot,
      accent: 'text-[#A81B0F] bg-[#A81B0F]/10 border-[#A81B0F]/20',
      bar: 'bg-[#A81B0F]',
      title: t('home_b_title'),
      method: t('home_b_method'),
      desc: t('home_b_desc'),
      agents: [
        { name: t('home_b_agent_planning'),  desc: t('home_b_agent_planning_desc') },
        { name: t('home_b_agent_retrieval'), desc: t('home_b_agent_retrieval_desc') },
        { name: t('home_b_agent_analysis'),  desc: t('home_b_agent_analysis_desc') },
      ],
      agentsFallback: '',
      steps: [t('home_b_step1'), t('home_b_step2'), t('home_b_step3')],
    },
    {
      key: 'c',
      icon: Calculator,
      accent: 'text-amber-600 bg-amber-50 border-amber-200',
      bar: 'bg-amber-500',
      title: t('home_c_title'),
      method: t('home_c_method'),
      desc: t('home_c_desc'),
      agents: [] as { name: string; desc: string }[],
      agentsFallback: t('home_no_agents_formula'),
      steps: [t('home_c_step1'), t('home_c_step2'), t('home_c_step3')],
    },
  ]

  return (
    <div className="space-y-10">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('home_title')}</h1>
        <p className="text-sm text-gray-500 mt-1">{t('home_subtitle')}</p>
        <p className="text-sm text-gray-600 mt-3">{t('home_welcome')}</p>
      </div>

      {/* ── Roadmap ──────────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            {t('home_process_title')}
          </h2>
          <p className="text-xs text-gray-500 mt-1">{t('home_process_caption')}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {stages.map((s, i) => {
            const Icon = s.icon
            return (
              <div
                key={s.key}
                className="relative bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col"
              >
                <div className={`h-1 ${s.bar}`} />
                <div className="p-5 flex flex-col gap-4 flex-1">

                  {/* Title row */}
                  <div className="flex items-start gap-3">
                    <div className={`shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center ${s.accent}`}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        {`0${i + 1}`}
                      </p>
                      <h3 className="text-sm font-bold text-gray-900 leading-tight">{s.title}</h3>
                      <span className={`inline-block mt-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full border ${s.accent}`}>
                        {s.method}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-gray-600 leading-relaxed">{s.desc}</p>

                  {/* Agents */}
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                      {t('home_agents_label')}
                    </p>
                    {s.agents.length > 0 ? (
                      <div className="space-y-1.5">
                        {s.agents.map(a => (
                          <div key={a.name} className="flex items-start gap-2">
                            <Bot size={13} className="text-[#A81B0F] mt-0.5 shrink-0" />
                            <div>
                              <p className="text-xs font-medium text-gray-800">{a.name}</p>
                              <p className="text-[11px] text-gray-500 leading-snug">{a.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-gray-500 italic">{s.agentsFallback}</p>
                    )}
                  </div>

                  {/* Steps */}
                  <div className="mt-auto">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                      {t('home_steps_label')}
                    </p>
                    <ol className="space-y-1.5">
                      {s.steps.map((step, j) => (
                        <li key={j} className="flex items-start gap-2">
                          <span className="shrink-0 w-4 h-4 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold flex items-center justify-center mt-0.5">
                            {j + 1}
                          </span>
                          <span className="text-[11px] text-gray-600 leading-snug">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Tenders ──────────────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
            {t('home_tenders_title')}
          </h2>
          <p className="text-xs text-gray-500 mt-1">{t('home_tenders_caption')}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tenders.map(tender => (
            <button
              key={tender.tender_id}
              onClick={() => openTender(tender.tender_id)}
              className="group text-left bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:border-[#A81B0F]/40 hover:shadow-md transition-all"
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-mono font-semibold text-[#A81B0F]">
                  {tender.tender_id.toUpperCase().replace(/_/g, '-')}
                </p>
                <ArrowRight
                  size={15}
                  className="text-gray-300 group-hover:text-[#A81B0F] group-hover:translate-x-0.5 transition-all"
                />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mt-1 leading-snug">
                {tender.label.replace(/^CTTI-[0-9-]+\s*-\s*/, '')}
              </h3>
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-gray-900 font-mono">
                  {tender.suppliers.length}
                </span>
                <span className="text-xs text-gray-500">{t('home_applications_label')}</span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
