import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import * as rag from '../../rag/index.js'
import type { EntityType } from '../../rag/entities.js'

const ENTITY_TYPES = [
  'questione', 'mastro-entry', 'nota', 'rfc', 'documento'
] as const

const searchSchema = z.object({
  query: z.string().min(1).describe(
    'Testo della ricerca semantica'
  ),
  limit: z.number().int().min(1).max(20).default(5).describe(
    'Numero massimo di risultati (1-20, default 5)'
  ),
  entity_type: z.enum(ENTITY_TYPES).optional().describe(
    'Filtro opzionale per tipo di entità'
  )
})

export function registerRagTools(): void {
  registerTool({
    name: 'search_opera',
    description:
      'Ricerca semantica nei contenuti dell\'OPERA: questioni, ' +
      'mastro, note, RFC e documenti. Richiede arricchimento rag.',
    schema: searchSchema,
    category: 'conditional',
    requiredEnrichments: ['rag'],
    handler: async (params: unknown): Promise<ToolResult> => {
      if (!rag.isAvailable()) {
        return {
          content: [{
            type: 'text',
            text: 'RAG non disponibile. Verificare che Qdrant sia ' +
              'in esecuzione e che configure sia stato chiamato con ' +
              'l\'arricchimento "rag".'
          }],
          isError: true
        }
      }

      const parsed = searchSchema.parse(params)
      const results = await rag.search(
        parsed.query,
        parsed.limit,
        parsed.entity_type as EntityType | undefined
      )

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            query: parsed.query,
            result_count: results.length,
            results
          }, null, 2)
        }]
      }
    }
  })
}
