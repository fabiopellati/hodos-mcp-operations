import { getActiveEnrichments } from '../server.js'

export function isFirmaActive(): boolean {
  return getActiveEnrichments().includes('firma-utente')
}

export function formatStoriaEntry(
  data: string,
  stato: string,
  motivazione: string,
  firma?: string
): string {
  if (isFirmaActive() && firma) {
    return `- ${data} ${stato} [${firma}] — ${motivazione}`
  }
  return `- ${data} ${stato} — ${motivazione}`
}

export function formatCommentoHeader(
  id: string,
  data: string,
  firma?: string
): string {
  if (isFirmaActive() && firma) {
    return `${id} — ${data} [${firma}]`
  }
  return `${id} — ${data}`
}

export function formatNotaAutore(firma?: string): string | null {
  if (isFirmaActive() && firma) {
    return `**Autore**: ${firma}`
  }
  return null
}
