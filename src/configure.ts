import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  registerTool,
  updateVisibility,
  getVisibleTools,
  getLoadedConfig,
  type ToolResult
} from './server.js'
import { VALID_ENRICHMENTS } from './operations/validate.js'
import { questioniPath, mastroPath } from './config/paths.js'
import { getEnabledEnrichments } from './config/config-file.js'
import { getDirectives } from './enrichments/redazionale/index.js'
import * as rag from './rag/index.js'

/**
 * Legge il fingerprint dell'OPERA: titolo del mastro e
 * contatori di questioni.md. Serve all'LLM per verificare
 * che il server operi sugli stessi file della sessione.
 */
async function readOperaFingerprint(): Promise<{
  mastro_titolo: string
  ultima_inserita: string
  ultima_chiusa: string
}> {
  let mastroTitolo = ''
  try {
    const mastro = await readFile(mastroPath(), 'utf-8')
    const titleMatch = mastro.match(/^#\s+(.+)$/m)
    if (titleMatch) mastroTitolo = titleMatch[1].trim()
  } catch {
    mastroTitolo = '(file non trovato)'
  }

  let ultimaInserita = ''
  let ultimaChiusa = ''
  try {
    const questioni = await readFile(questioniPath(), 'utf-8')
    const insMatch = questioni.match(
      /Ultima questione inserita:\s*(.+)/
    )
    if (insMatch) ultimaInserita = insMatch[1].trim()
    const chiusaMatch = questioni.match(
      /Ultima questione chiusa:\s*(.+)/
    )
    if (chiusaMatch) ultimaChiusa = chiusaMatch[1].trim()
  } catch {
    ultimaInserita = '(file non trovato)'
    ultimaChiusa = '(file non trovato)'
  }

  return {
    mastro_titolo: mastroTitolo,
    ultima_inserita: ultimaInserita,
    ultima_chiusa: ultimaChiusa
  }
}

const configureSchema = z.object({
  arricchimenti: z.array(z.string()).optional()
})

export function registerConfigureTool(): void {
  registerTool({
    name: 'configure',
    description:
      'Configura il server MCP attivando gli arricchimenti specificati. ' +
      'Se chiamato senza parametri e un file di configurazione è presente, ' +
      'usa i valori dal file come default. ' +
      'Restituisce la lista dei tool visibili dopo la configurazione.',
    schema: configureSchema,
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const parsed = configureSchema.parse(params)

      // Se non specificati, usa i default dal file di configurazione
      let arricchimenti = parsed.arricchimenti
      if (!arricchimenti || arricchimenti.length === 0) {
        const config = getLoadedConfig()
        if (config) {
          arricchimenti = getEnabledEnrichments(config)
        } else {
          arricchimenti = []
        }
      }

      // Valida gli arricchimenti
      const invalidi = arricchimenti.filter(
        a => !(VALID_ENRICHMENTS as readonly string[]).includes(a)
      )
      if (invalidi.length > 0) {
        return {
          content: [{
            type: 'text',
            text: `Arricchimenti non validi: ${invalidi.join(', ')}. ` +
              `Valori ammessi: ${VALID_ENRICHMENTS.join(', ')}`
          }],
          isError: true
        }
      }

      // Init RAG se richiesto
      if (arricchimenti.includes('rag')) {
        await rag.initialize()
      }

      updateVisibility(arricchimenti)

      const visibili = getVisibleTools().map(t => t.name)
      const fingerprint = await readOperaFingerprint()

      const response: Record<string, unknown> = {
        arricchimenti_attivi: arricchimenti,
        tool_visibili: visibili,
        opera_fingerprint: fingerprint
      }

      if (arricchimenti.includes('rag')) {
        response.rag_status = rag.getStatus()
      }

      if (arricchimenti.includes('redazionale')) {
        const directives = getDirectives()
        if (directives) {
          response.direttive_redazionali = directives
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }]
      }
    }
  })
}
