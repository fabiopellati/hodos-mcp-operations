import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { atomicFileOperation, insertAt } from '../../operations/atomic.js'
import { findAfterTitleOffset } from '../../parser/sections.js'
import { validateStrings } from '../../operations/validate.js'
import { isCompressioneActive, isPercorsoRequired } from '../../enrichments/compressione.js'
import { mastroPath } from '../../config/paths.js'

const today = () => new Date().toISOString().slice(0, 10)

export function registerMastroWriteTools(): void {
  registerTool({
    name: 'create_entry',
    description:
      'Crea una nuova entry nel mastro per documentare la chiusura di una questione. Prepend-only.',
    schema: z.object({
      questione_id: z.string(),
      titolo: z.string(),
      percorso: z.string().optional(),
      decisioni: z.string(),
      impatto: z.string()
    }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const schema = z.object({
        questione_id: z.string(),
        titolo: z.string(),
        percorso: z.string().optional(),
        decisioni: z.string(),
        impatto: z.string()
      })
      const parsed = schema.parse(params)
      validateStrings({
        titolo: parsed.titolo,
        decisioni: parsed.decisioni,
        impatto: parsed.impatto
      })

      if (!parsed.percorso && isPercorsoRequired()) {
        return {
          content: [{
            type: 'text',
            text: 'Il campo "percorso" è obbligatorio quando l\'arricchimento ' +
              '"compressione-mastro" non è attivo.'
          }],
          isError: true
        }
      }

      await atomicFileOperation(mastroPath(), (content, tree) => {
        const date = today()
        const offset = findAfterTitleOffset(tree)

        let entry = `\n\n## ${date} — Chiusura ${parsed.questione_id}: ${parsed.titolo}\n\n`
        entry += `**Questione**: ${parsed.questione_id} — ${parsed.titolo}\n\n`

        if (parsed.percorso && !isCompressioneActive()) {
          entry += `**Percorso**\n\n${parsed.percorso}\n\n`
        }

        entry += `**Decisioni prese**\n\n${parsed.decisioni}\n\n`
        entry += `**Impatto**\n\n${parsed.impatto}\n\n---\n`

        let result = insertAt(content, offset, entry)

        // Rimuovi eventuale thematicBreak duplicato subito dopo quello appena inserito
        const insertedEnd = offset + entry.length
        const afterInsert = result.slice(insertedEnd).replace(/^\n*/, '')
        if (afterInsert.startsWith('---')) {
          const breakStart = insertedEnd + (result.length - insertedEnd - afterInsert.length)
          const breakEnd = breakStart + 3
          // Rimuovi anche eventuali newline attorno al --- duplicato
          let removeEnd = breakEnd
          while (removeEnd < result.length && result[removeEnd] === '\n') {
            removeEnd++
          }
          result = result.slice(0, breakStart) + result.slice(removeEnd)
        }

        return result
      })

      return {
        content: [{
          type: 'text',
          text: `Entry mastro creata per ${parsed.questione_id}.`
        }]
      }
    }
  })
}
