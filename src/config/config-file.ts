import { readFile, writeFile } from 'node:fs/promises'
import { parse, stringify } from 'yaml'
import { configFilePath } from './paths.js'
import { VALID_ENRICHMENTS } from '../operations/validate.js'

export type EnrichmentConfig = {
  enabled: boolean
  [key: string]: unknown
}

export type HodosConfig = {
  arricchimenti: Record<string, EnrichmentConfig>
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
