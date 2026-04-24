/**
 * Restituisce la data corrente in formato YYYY-MM-DD
 * usando il fuso orario locale del processo.
 *
 * In un container Docker il fuso orario è controllato
 * dalla variabile d'ambiente TZ (es. TZ=Europe/Rome).
 * Senza TZ impostata, il default è UTC.
 */
export function today(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
