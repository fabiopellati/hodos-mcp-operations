import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { readRaw } from '../../operations/atomic.js'
import { parseMarkdown } from '../../parser/markdown.js'
import {
  findIndexTable,
  findBlockByHeadingId,
  findLineByPatternInRange,
  type BlockRange
} from '../../parser/sections.js'
import { validateEnum, VALID_STATES } from '../../operations/validate.js'
import { questioniPath } from '../../config/paths.js'

/**
 * Trova il blocco di una questione per ID.
 * Il blocco va dall'heading h2 al thematicBreak escluso.
 * Delega a findBlockByHeadingId da sections.ts.
 */
function findQuestioneBlock(
  tree: import('mdast').Root,
  id: string
): BlockRange | null {
  return findBlockByHeadingId(tree, id)
}

export { findQuestioneBlock }

export function registerQuestioniReadTools(): void {
  registerTool({
    name: 'read_questioni_index',
    description:
      'Restituisce la tabella indice di questioni.md serializzata in markdown.',
    schema: z.object({}),
    category: 'base',
    requiredEnrichments: [],
    handler: async (): Promise<ToolResult> => {
      const content = await readRaw(questioniPath())
      const tree = parseMarkdown(content)
      const result = findIndexTable(tree)
      if (!result) {
        return {
          content: [{ type: 'text', text: 'Tabella indice non trovata.' }],
          isError: true
        }
      }
      return {
        content: [{
          type: 'text',
          text: content.slice(result.startOffset, result.endOffset)
        }]
      }
    }
  })

  registerTool({
    name: 'read_questione',
    description:
      'Restituisce il contenuto di una questione per ID (heading h2 fino al separatore --- escluso).',
    schema: z.object({ id: z.string() }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { id } = z.object({ id: z.string() }).parse(params)
      const content = await readRaw(questioniPath())
      const tree = parseMarkdown(content)
      const block = findQuestioneBlock(tree, id)
      if (!block) {
        return {
          content: [{ type: 'text', text: `Questione ${id} non trovata.` }],
          isError: true
        }
      }
      return {
        content: [{
          type: 'text',
          text: content.slice(block.startOffset, block.endOffset)
        }]
      }
    }
  })

  registerTool({
    name: 'list_questioni',
    description:
      'Restituisce le righe dell\'indice questioni, filtrate per stato se specificato.',
    schema: z.object({ stato: z.string().optional() }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { stato } = z.object({ stato: z.string().optional() }).parse(params)
      if (stato) {
        validateEnum(stato, VALID_STATES, 'stato')
      }

      const content = await readRaw(questioniPath())
      const tree = parseMarkdown(content)
      const result = findIndexTable(tree)
      if (!result) {
        return {
          content: [{ type: 'text', text: 'Tabella indice non trovata.' }],
          isError: true
        }
      }

      if (!stato) {
        return {
          content: [{
            type: 'text',
            text: content.slice(result.startOffset, result.endOffset)
          }]
        }
      }

      // Filtra per stato: estrai header + righe che matchano
      const tableSlice = content.slice(result.startOffset, result.endOffset)
      const lines = tableSlice.split('\n')
      // lines[0] = header, lines[1] = separator (---|---|---), lines[2..] = data rows
      const filtered = lines.filter((line, i) => {
        if (i <= 1) return true // header + separator
        if (line.trim() === '') return false
        // La terza colonna contiene lo stato
        const cells = line.split('|').map(c => c.trim()).filter(c => c !== '')
        return cells.length >= 3 && cells[2] === stato
      })

      return {
        content: [{ type: 'text', text: filtered.join('\n') }]
      }
    }
  })
}
