import path from 'node:path'
import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { atomicFileOperation } from '../../operations/atomic.js'
import { parseMarkdown } from '../../parser/markdown.js'
import { findInsertionPointAfterTitle } from '../../parser/sections.js'
import { validateStrings } from '../../operations/validate.js'
import { isCompressioneActive, isPercorsoRequired } from '../../enrichments/compressione.js'

const basePath = process.env.OPERA_BASE_PATH || '/opera'
const mastroPath = () => path.join(basePath, 'mastro.md')

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

      await atomicFileOperation(mastroPath(), (tree) => {
        const date = today()

        let body = `## ${date} — Chiusura ${parsed.questione_id}: ${parsed.titolo}\n\n`
        body += `**Questione**: ${parsed.questione_id} — ${parsed.titolo}\n\n`

        if (parsed.percorso && !isCompressioneActive()) {
          body += `**Percorso**\n\n${parsed.percorso}\n\n`
        }

        body += `**Decisioni prese**\n\n${parsed.decisioni}\n\n`
        body += `**Impatto**\n\n${parsed.impatto}\n`

        const bodyTree = parseMarkdown(body)
        const insertPoint = findInsertionPointAfterTitle(tree)

        // Inserisci dopo il titolo h1, prima di tutto il resto
        tree.children.splice(
          insertPoint,
          0,
          ...bodyTree.children,
          { type: 'thematicBreak' }
        )

        return tree
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
