import { readFile, writeFile } from 'node:fs/promises'
import { parse, stringify } from 'yaml'
import { configFilePath } from './paths.js'
import { VALID_ENRICHMENTS } from '../operations/validate.js'

export type EnrichmentConfig = {
  enabled: boolean
  [key: string]: unknown
}

export const PERCORSI_KEYS = ['governance', 'fasi', 'rfc'] as const
export type PercorsoKey = typeof PERCORSI_KEYS[number]
export type PercorsiConfig = Partial<Record<PercorsoKey, string>>

export type HodosConfig = {
  arricchimenti: Record<string, EnrichmentConfig>
  percorsi?: PercorsiConfig
}

export async function loadConfigFile(): Promise<HodosConfig | null> {
  try {
    const content = await readFile(configFilePath, 'utf-8')
    const parsed = parse(content)

    if (!parsed || typeof parsed !== 'object') {
      return { arricchimenti: {} }
    }

    const config = parsed as HodosConfig
    if (!config.arricchimenti || typeof config.arricchimenti !== 'object') {
      return { arricchimenti: {} }
    }

    // Valida i nomi degli arricchimenti
    for (const name of Object.keys(config.arricchimenti)) {
      if (!(VALID_ENRICHMENTS as readonly string[]).includes(name)) {
        console.warn(
          `Configurazione: arricchimento "${name}" non valido, ignorato. ` +
          `Valori ammessi: ${VALID_ENRICHMENTS.join(', ')}`
        )
        delete config.arricchimenti[name]
      }
    }

    if (config.percorsi && typeof config.percorsi === 'object') {
      const validated: PercorsiConfig = {}
      for (const [key, value] of Object.entries(config.percorsi)) {
        if (!(PERCORSI_KEYS as readonly string[]).includes(key)) {
          console.warn(
            `Configurazione: percorso "${key}" non valido, ignorato. ` +
            `Valori ammessi: ${PERCORSI_KEYS.join(', ')}`
          )
          continue
        }
        if (typeof value !== 'string' || value.length === 0) {
          console.warn(
            `Configurazione: percorso "${key}" deve essere una stringa ` +
            `non vuota, ignorato.`
          )
          continue
        }
        validated[key as PercorsoKey] = value
      }
      config.percorsi = validated
    } else {
      delete config.percorsi
    }

    return config
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }
    console.error(
      `Errore nel parsing del file di configurazione ${configFilePath}:`,
      err
    )
    return null
  }
}

export async function writeConfigFile(config: HodosConfig): Promise<void> {
  const content = stringify(config, { lineWidth: 80 })
  await writeFile(configFilePath, content, 'utf-8')
}

export function getEnabledEnrichments(config: HodosConfig): string[] {
  return Object.entries(config.arricchimenti)
    .filter(([, v]) => v.enabled)
    .map(([k]) => k)
}

export function getRedazionaleConfig(
  config: HodosConfig
): EnrichmentConfig | null {
  const red = config.arricchimenti['redazionale']
  if (!red || !red.enabled) return null
  return red
}
