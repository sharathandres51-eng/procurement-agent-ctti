import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import translations from './translations.json'

// The JSON is keyed by lang code at the top level: { en: {...}, es: {...}, ca: {...} }
// i18next expects resources keyed as { en: { translation: {...} }, ... }
const resources = Object.fromEntries(
  Object.entries(translations).map(([lang, keys]) => [
    lang,
    { translation: keys },
  ])
)

i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React already escapes
  },
})

export default i18n

export const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: 'English',
  es: 'Español',
  ca: 'Català',
}
