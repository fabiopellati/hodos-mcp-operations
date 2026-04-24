import { z } from 'zod'
import { registerTool, updateVisibility, setLoadedConfig, type ToolResult } from '../../server.js'
import {
  loadConfigFile,
  writeConfigFile,
  getEnabledEnrichments,
  type HodosConfig
} from '../../config/config-file.js'
import { VALID_ENRICHMENTS } from '../../operations/validate.js'

const updateConfigSchema = z.object({
  path: z.string().describe(
    'Path puntato nella configurazione ' +
    '(es. "arricchimenti.redazionale.enabled")'
  ),
  value: z.union([z.string(), z.number(), z.boolean()]).describe(
    'Nuovo valore da impostare'
  )
})

function setNestedValue(
  obj: Record<string, unknown>,
  segments: string[],
  value: unknown
): void {
  let current = obj as Record<string, unknown>
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i]
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }
  current[segments[segments.length - 1]] = value
}

export function registerConfigTools(): void {
  registerTool({
    name: 'update_config',
    description:
      'Modifica il file di configurazione hodos-operations.yml. ' +
      'Accetta un path puntato (es. "arricchimenti.fasi-p0-p4.enabled") ' +
      'e un valore. Persiste la modifica su disco e aggiorna la ' +
      'configurazione in memoria.',
    schema: updateConfigSchema,
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const parsed = updateConfigSchema.parse(params)
      const segments = parsed.path.split('.')

      if (segments.length < 2) {
        return {
          content: [{ type: 'text', text:
            'Il path deve avere almeno due segmenti ' +
            '(es. "arricchimenti.nome.enabled")'
          }],
          isError: true
        }
      }

      if (segments[0] !== 'arricchimenti') {
        return {
          content: [{ type: 'text', text:
            'Il primo segmento del path deve essere "arricchimenti"'
          }],
          isError: true
        }
      }

      const enrichmentName = segments[1]
      if (!(VALID_ENRICHMENTS as readonly string[]).includes(enrichmentName)) {
        return {
          content: [{ type: 'text', text:
            `Arricchimento "${enrichmentName}" non valido. ` +
            `Valori ammessi: ${VALID_ENRICHMENTS.join(', ')}`
          }],
          isError: true
        }
      }

      // Carica o crea configurazione
      let config = await loadConfigFile()
      if (!config) {
        config = { arricchimenti: {} }
      }

      // Imposta il valore
      setNestedValue(
        config as unknown as Record<string, unknown>,
        segments,
        parsed.value
      )

      // Scrivi su disco
      await writeConfigFile(config)

      // Aggiorna in memoria
      setLoadedConfig(config)

      // Aggiorna visibilità se necessario
      const enrichments = getEnabledEnrichments(config)
      updateVisibility(enrichments)

      return {
        content: [{ type: 'text', text:
          JSON.stringify({
            messaggio: `Configurazione aggiornata: ${parsed.path} = ${parsed.value}`,
            arricchimenti_attivi: enrichments,
            configurazione: config
          }, null, 2)
        }]
      }
    }
  })
}
