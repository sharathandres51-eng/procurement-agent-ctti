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
    `px-4 py-2 text-sm font-medium rounded-md transition-colors ${
      isActive
        ? 'bg-slate-700 text-white'
        : 'text-slate-400 hover:text-white hover:bg-slate-800'
    }`

  return (
    <div className="min-h-screen bg-slate-900 flex">
      {/* ── Sidebar ── */}
      <aside className="w-64 shrink-0 bg-slate-950 border-r border-slate-800 flex flex-col">
        <div className="p-4 border-b border-slate-800">
          <h1 className="text-sm font-bold text-white uppercase tracking-widest">CTTI</h1>
          <p className="text-xs text-slate-500 mt-0.5">Procurement Workbench</p>
        </div>

        {/* Tender selector */}
        <div className="p-4 border-b border-slate-800">
          <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2">
            {t('select_tender')}
          </label>
          <select
            value={selectedTenderId}
            onChange={e => onTenderChange(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            {tenders.map(td => (
              <option key={td.tender_id} value={td.tender_id}>
                {td.label}
              </option>
            ))}
          </select>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          <NavLink to="/" end className={navLinkClass}>
            📋 {t('tab_dashboard')}
          </NavLink>
          <NavLink to="/audit" className={navLinkClass}>
            📁 {t('tab_audit')}
          </NavLink>
          <NavLink to="/sobre-c" className={navLinkClass}>
            📊 {t('tab_sobre_c')}
          </NavLink>
        </nav>

        {/* Language selector */}
        <div className="p-4 border-t border-slate-800 relative">
          <button
            onClick={() => setLangOpen(o => !o)}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white w-full"
          >
            <Globe size={14} />
            {SUPPORTED_LANGUAGES[i18n.language] ?? 'English'}
            <span className="ml-auto">▾</span>
          </button>
          {langOpen && (
            <div className="absolute bottom-14 left-4 right-4 bg-slate-800 border border-slate-700 rounded-md overflow-hidden shadow-xl z-10">
              {Object.entries(SUPPORTED_LANGUAGES).map(([code, label]) => (
                <button
                  key={code}
                  onClick={() => {
                    i18n.changeLanguage(code)
                    setLangOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-700 transition-colors ${
                    i18n.language === code ? 'text-amber-400 font-semibold' : 'text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  )
}
