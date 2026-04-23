import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import {
  registerTool,
  updateVisibility,
  getVisibleTools,
  type ToolResult
} from './server.js'
import { VALID_ENRICHMENTS } from './operations/validate.js'
import { questioniPath, mastroPath } from './config/paths.js'
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
  arricchimenti: z.array(z.string())
})

export function registerConfigureTool(): void {
  registerTool({
    name: 'configure',
    description:
      'Configura il server MCP attivando gli arricchimenti specificati. ' +
      'Restituisce la lista dei tool visibili dopo la configurazione.',
    schema: configureSchema,
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const parsed = configureSchema.parse(params)

      // Valida gli arricchimenti
      const invalidi = parsed.arricchimenti.filter(
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
      if (parsed.arricchimenti.includes('rag')) {
        await rag.initialize()
      }

      updateVisibility(parsed.arricchimenti)

      const visibili = getVisibleTools().map(t => t.name)
      const fingerprint = await readOperaFingerprint()

      const response: Record<string, unknown> = {
        arricchimenti_attivi: parsed.arricchimenti,
        tool_visibili: visibili,
        opera_fingerprint: fingerprint
      }

      if (parsed.arricchimenti.includes('rag')) {
        response.rag_status = rag.getStatus()
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
