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
        : 'text-white/70 border-transparent hover:text-white hover:border-white/60'
    }`

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Top bar ── */}
      <header className="bg-[#A81B0F] h-14 shrink-0 flex items-stretch px-6 gap-6">

        {/* Brand - links home */}
        <NavLink to="/" className="flex items-center gap-2 shrink-0 mr-2">
          <img
            src="/ctti_logo.jpeg"
            alt="CTTI"
            className="h-8 w-8 rounded object-cover bg-white/90 p-0.5"
          />
          <span className="text-sm font-bold text-white uppercase tracking-widest">CTTI</span>
          <span className="text-xs text-white/60 hidden sm:block">{t('app_subtitle')}</span>
        </NavLink>

        {/* Tender selector */}
        <div className="flex items-center shrink-0">
          <select
            value={selectedTenderId}
            onChange={e => onTenderChange(e.target.value)}
            className="bg-[#8A160C] border border-white/25 text-white text-xs rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-white/60"
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
          <NavLink to="/sobre-a" className={navLinkClass}>
            {t('tab_sobre_a')}
          </NavLink>
          <NavLink to="/sobre-b" className={navLinkClass}>
            {t('tab_sobre_b')}
          </NavLink>
          <NavLink to="/sobre-c" className={navLinkClass}>
            {t('tab_sobre_c')}
          </NavLink>
          <NavLink to="/audit" className={navLinkClass}>
            {t('tab_audit')}
          </NavLink>
        </nav>

        {/* Language selector */}
        <div className="flex items-center relative">
          <button
            onClick={() => setLangOpen(o => !o)}
            className="flex items-center gap-1.5 text-xs text-white/80 hover:text-white px-2 py-1 rounded transition-colors"
          >
            <Globe size={14} />
            {SUPPORTED_LANGUAGES[i18n.language] ?? 'English'}
            <span>▾</span>
          </button>
          {langOpen && (
            <div className="absolute top-12 right-0 bg-white border border-gray-200 rounded-md overflow-hidden shadow-xl z-10 min-w-32">
              {Object.entries(SUPPORTED_LANGUAGES).map(([code, label]) => (
                <button
                  key={code}
                  onClick={() => {
                    i18n.changeLanguage(code)
                    setLangOpen(false)
                  }}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-100 transition-colors ${
                    i18n.language === code ? 'text-[#A81B0F] font-semibold' : 'text-gray-600'
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
