import { join, normalize, resolve } from 'node:path'

export const operaRoot = process.env.OPERA_ROOT
  || process.env.OPERA_BASE_PATH
  || '/opera'

export const processoDir = process.env.OPERA_PROCESSO_DIR || operaRoot
export const rfcDir = process.env.OPERA_RFC_DIR || join(processoDir, 'rfc')
export const documentiDir = process.env.OPERA_DOCUMENTI_DIR || join(operaRoot, 'documenti')

export function questioniPath(): string {
  return join(processoDir, 'questioni.md')
}

export function mastroPath(): string {
  return join(processoDir, 'mastro.md')
}

export function notesPath(): string {
  return join(processoDir, 'notes.md')
}

export function resolveDocPath(relativePath: string): string {
  const normalized = normalize(relativePath)
  if (!normalized.startsWith('documenti/') && !normalized.startsWith('documenti\\')) {
    throw new Error(
      `Il path deve essere sotto "documenti/". Ricevuto: ${relativePath}`
    )
  }
  const subPath = normalized.replace(/^documenti[/\\]/, '')
  const full = resolve(documentiDir, subPath)
  if (!full.startsWith(documentiDir)) {
    throw new Error(`Path non valido: ${relativePath}`)
  }
  return full
}
