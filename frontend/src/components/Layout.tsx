import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NavLink } from 'react-router-dom'
import { Globe } from 'lucide-react'
import { SUPPORTED_LANGUAGES } from '../i18n'
import type { TenderSummary } from '../types'

interface LayoutProps {
  tenders: TenderSummary[]
  selectedTenderId: string
  onTenderChange: (id: string) => void
  children: React.ReactNode
}

export default function Layout({
  tenders,
  selectedTenderId,
  onTenderChange,
  children,
}: LayoutProps) {
  const { t, i18n } = useTranslation()
  const [langOpen, setLangOpen] = useState(false)

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1.5 px-4 h-full text-sm font-medium transition-colors border-b-2 ${
      isActive
        ? 'text-white border-white'
        : 'text-slate-400 border-transparent hover:text-white hover:border-slate-400'
    }`

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Top bar ── */}
      <header className="bg-slate-900 h-14 shrink-0 flex items-stretch px-6 gap-6">

        {/* Brand */}
        <div className="flex items-center gap-2 shrink-0 mr-2">
          <span className="text-base">⚖️</span>
          <span className="text-sm font-bold text-white uppercase tracking-widest">CTTI</span>
          <span className="text-xs text-slate-500 hidden sm:block">{t('app_subtitle')}</span>
        </div>

        {/* Tender selector */}
        <div className="flex items-center shrink-0">
          <select
            value={selectedTenderId}
            onChange={e => onTenderChange(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#0057A8]"
          >
            {tenders.map(td => (
              <option key={td.tender_id} value={td.tender_id}>
                {td.label}
              </option>
            ))}
          </select>
        </div>

        {/* Nav tabs */}
        <nav className="flex items-stretch flex-1 gap-1">
          <NavLink to="/" end className={navLinkClass}>
            📋 {t('tab_dashboard')}
          </NavLink>
          <NavLink to="/sobre-c" className={navLinkClass}>
            🧮 {t('tab_sobre_c')}
          </NavLink>
          <NavLink to="/audit" className={navLinkClass}>
            📝 {t('tab_audit')}
          </NavLink>
        </nav>

        {/* Language selector */}
        <div className="flex items-center relative">
          <button
            onClick={() => setLangOpen(o => !o)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white px-2 py-1 rounded transition-colors"
          >
            <Globe size={14} />
            {SUPPORTED_LANGUAGES[i18n.language] ?? 'English'}
            <span>▾</span>
          </button>
          {langOpen && (
            <div className="absolute top-12 right-0 bg-slate-800 border border-slate-700 rounded-md overflow-hidden shadow-xl z-10 min-w-32">
              {Object.entries(SUPPORTED_LANGUAGES).map(([code, label]) => (
                <button
                  key={code}
                  onClick={() => {
                    i18n.changeLanguage(code)
                    setLangOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-700 transition-colors ${
                    i18n.language === code ? 'text-[#0057A8] font-semibold' : 'text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
