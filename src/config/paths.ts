import { isAbsolute, join, normalize, resolve } from 'node:path'
import type { PercorsiConfig, PercorsoKey } from './config-file.js'

export const operaRoot = process.env.OPERA_ROOT
  || process.env.OPERA_BASE_PATH
  || '/opera'

export const configFilePath = process.env.HODOS_CONFIG_PATH
  || join(operaRoot, 'hodos-operations.yml')

let loadedPercorsi: PercorsiConfig = {}

export function setLoadedPaths(percorsi: PercorsiConfig | undefined): void {
  loadedPercorsi = percorsi ?? {}
}

export function getLoadedPaths(): PercorsiConfig {
  return loadedPercorsi
}

export function processoDir(): string {
  return loadedPercorsi.governance
    || process.env.OPERA_PROCESSO_DIR
    || operaRoot
}

export function rfcDir(): string {
  return loadedPercorsi.rfc
    || process.env.OPERA_RFC_DIR
    || join(processoDir(), 'rfc')
}

export function documentiDir(): string {
  return loadedPercorsi.fasi
    || process.env.OPERA_DOCUMENTI_DIR
    || join(operaRoot, 'documenti')
}

export function questioniPath(): string {
  return join(processoDir(), 'questioni.md')
}

export function mastroPath(): string {
  return join(processoDir(), 'mastro.md')
}

export function notesPath(): string {
  return join(processoDir(), 'notes.md')
}

export function resolveDocPath(relativePath: string): string {
  const docsDir = documentiDir()
  const normalized = normalize(relativePath)
  if (!normalized.startsWith('documenti/') && !normalized.startsWith('documenti\\')) {
    throw new Error(
      `Il path deve essere sotto "documenti/". Ricevuto: ${relativePath}`
    )
  }
  const subPath = normalized.replace(/^documenti[/\\]/, '')
  const full = resolve(docsDir, subPath)
  if (!full.startsWith(docsDir)) {
    throw new Error(`Path non valido: ${relativePath}`)
  }
  return full
}

export interface SemanticRoot {
  key: PercorsoKey
  path: string
}

export function listRoots(): SemanticRoot[] {
  return [
    { key: 'governance', path: processoDir() },
    { key: 'rfc', path: rfcDir() },
    { key: 'fasi', path: documentiDir() }
  ]
}

/**
 * Risolve un path relativo dell'opera nel filesystem locale, instradando
 * verso la radice semantica appropriata in base al prefisso convenzionale.
 * I path assoluti sono ritornati invariati.
 */
export function resolveOperaPath(relativePath: string): string {
  if (isAbsolute(relativePath)) return relativePath
  const normalized = normalize(relativePath)
  if (
    normalized.startsWith('documenti/') ||
    normalized.startsWith('documenti\\')
  ) {
    return resolveDocPath(normalized)
  }
  if (
    normalized.startsWith('rfc/') ||
    normalized.startsWith('rfc\\')
  ) {
    return join(rfcDir(), normalized.replace(/^rfc[/\\]/, ''))
  }
  return join(processoDir(), normalized)
}
