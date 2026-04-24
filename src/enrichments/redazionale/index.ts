import { getLoadedConfig } from '../../server.js'
import { getRedazionaleConfig } from '../../config/config-file.js'
import { getStrategy, type LocaleDefaults } from './strategies.js'

export type RedazionaleDirective = {
  valore: unknown
  tipo: 'deterministica' | 'persuasiva'
}

export type RedazionaleDirectives = {
  lingua: string
  direttive: Record<string, RedazionaleDirective>
  regole_persuasive: string[]
}

export function isRedazionaleActive(): boolean {
  const config = getLoadedConfig()
  if (!config) return false
  const red = config.arricchimenti['redazionale']
  return red?.enabled === true
}

export function getDirectives(
  overrides?: Record<string, unknown>
): RedazionaleDirectives | null {
  const config = getLoadedConfig()
  const redConfig = config ? getRedazionaleConfig(config) : null

  // Se non c'e' configurazione esplicita e non ci sono override, non attivo
  if (!redConfig && !overrides) return null

  const lingua = (overrides?.lingua ?? redConfig?.lingua ?? 'it_IT') as string

  let strategy: LocaleDefaults
  try {
    strategy = getStrategy(lingua)
  } catch {
    return null
  }

  // Merge: default strategy <- file config <- override runtime
  const merged = { ...strategy } as Record<string, unknown>
  if (redConfig) {
    for (const [k, v] of Object.entries(redConfig)) {
      if (k !== 'enabled' && v !== undefined) merged[k] = v
    }
  }
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== undefined) merged[k] = v
    }
  }

  return {
    lingua,
    direttive: {
      'wrap-colonne': {
        valore: merged['wrap-colonne'],
        tipo: 'deterministica'
      },
      accenti: {
        valore: merged['accenti'],
        tipo: 'deterministica'
      },
      emoji: {
        valore: merged['emoji'],
        tipo: 'deterministica'
      },
      'formato-data': {
        valore: merged['formato-data'],
        tipo: 'deterministica'
      },
      'formato-ora': {
        valore: merged['formato-ora'],
        tipo: 'deterministica'
      },
      'stile-discorsivo': {
        valore: merged['stile-discorsivo'],
        tipo: 'persuasiva'
      },
      'tabelle-markdown': {
        valore: merged['tabelle-markdown'],
        tipo: 'persuasiva'
      }
    },
    regole_persuasive: strategy.regole_persuasive
  }
}
