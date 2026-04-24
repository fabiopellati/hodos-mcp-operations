import { isRedazionaleActive, getDirectives } from '../enrichments/redazionale/index.js'

function formatDate(date: Date, format: string): string {
  const Y = String(date.getFullYear())
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const H = String(date.getHours()).padStart(2, '0')
  const h12 = date.getHours() % 12 || 12
  const h = String(h12).padStart(2, '0')
  const i = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  const A = date.getHours() < 12 ? 'AM' : 'PM'

  return format
    .replace(/Y/g, Y)
    .replace(/m/g, m)
    .replace(/d/g, d)
    .replace(/H/g, H)
    .replace(/h/g, h)
    .replace(/i/g, i)
    .replace(/s/g, s)
    .replace(/A/g, A)
}

function getDateFormat(): string {
  if (!isRedazionaleActive()) return 'Y-m-d'
  const directives = getDirectives()
  if (!directives) return 'Y-m-d'
  return (directives.direttive['formato-data']?.valore as string) || 'Y-m-d'
}

function getTimeFormat(): string {
  if (!isRedazionaleActive()) return 'H:i'
  const directives = getDirectives()
  if (!directives) return 'H:i'
  return (directives.direttive['formato-ora']?.valore as string) || 'H:i'
}

/**
 * Restituisce la data corrente nel formato configurato.
 * Senza arricchimento redazionale attivo, produce Y-m-d.
 */
export function today(): string {
  return formatDate(new Date(), getDateFormat())
}

/**
 * Restituisce data e ora correnti nel formato configurato.
 * Senza arricchimento redazionale attivo, produce Y-m-d H:i.
 */
export function now(): string {
  const date = new Date()
  return `${formatDate(date, getDateFormat())} ${formatDate(date, getTimeFormat())}`
}
