export const VALID_STATES = [
  'open', 'in-progress', 'pending-approval',
  'pending-rfc', 'in-verification', 'deferred', 'closed'
] as const

export const VALID_ENRICHMENTS = [
  'fasi-p0-p4', 'firma-utente',
  'compressione-mastro', 'versionamento-git', 'rag'
] as const

export function validateUtf8(value: string, paramName: string): void {
  if (value.includes('\uFFFD')) {
    throw new Error(
      `Parametro "${paramName}" contiene caratteri UTF-8 non validi (U+FFFD)`
    )
  }
}

export function validateStrings(params: Record<string, string>): void {
  for (const [name, value] of Object.entries(params)) {
    validateUtf8(value, name)
  }
}

export function validateEnum(
  value: string,
  allowed: readonly string[],
  paramName: string
): void {
  if (!allowed.includes(value)) {
    throw new Error(
      `Valore "${value}" non valido per "${paramName}". ` +
      `Valori ammessi: ${allowed.join(', ')}`
    )
  }
}
