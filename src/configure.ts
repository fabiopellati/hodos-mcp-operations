import { z } from 'zod'
import {
  registerTool,
  updateVisibility,
  getVisibleTools,
  type ToolResult
} from './server.js'
import { VALID_ENRICHMENTS } from './operations/validate.js'

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

      updateVisibility(parsed.arricchimenti)

      const visibili = getVisibleTools().map(t => t.name)
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            arricchimenti_attivi: parsed.arricchimenti,
            tool_visibili: visibili
          }, null, 2)
        }]
      }
    }
  })
}
