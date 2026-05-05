import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { readRaw } from '../../operations/atomic.js'
import { parseMarkdown } from '../../parser/markdown.js'
import {
  findIndexList,
  findIndexTable,
  findBlockByHeadingId,
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

/**
 * Costruisce l'errore da restituire quando findIndexList non trova
 * un elenco indice. Se il documento contiene un indice nel vecchio
 * formato a tabella, l'errore documenta il cambio di formato e indica
 * l'intervento richiesto dal protocollo Hodos.
 */
function buildIndexNotFoundError(tree: import('mdast').Root): ToolResult {
  if (findIndexTable(tree)) {
    return {
      content: [{
        type: 'text',
        text:
          'Indice in formato tabella rilevato. ' +
          'Il protocollo Hodos richiede il formato a elenco puntato: ' +
          'ogni riga deve avere la forma `- **ID** — Titolo — stato`. ' +
          'Aggiornare la sezione "## Indice" di questioni.md al nuovo ' +
          'formato prima di utilizzare i tool di lettura.'
      }],
      isError: true
    }
  }
  return {
    content: [{ type: 'text', text: 'Indice non trovato.' }],
    isError: true
  }
}

export function registerQuestioniReadTools(): void {
  registerTool({
    name: 'read_questioni_index',
    description:
      'Restituisce l\'elenco indice di questioni.md serializzato in markdown.',
    schema: z.object({}),
    category: 'base',
    requiredEnrichments: [],
    handler: async (): Promise<ToolResult> => {
      const content = await readRaw(questioniPath())
      const tree = parseMarkdown(content)
      const result = findIndexList(tree)
      if (!result) return buildIndexNotFoundError(tree)
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
      const result = findIndexList(tree)
      if (!result) return buildIndexNotFoundError(tree)

      const listSlice = content.slice(result.startOffset, result.endOffset)

      if (!stato) {
        return {
          content: [{ type: 'text', text: listSlice }]
        }
      }

      // Filtra per stato: ogni riga ha formato `- **ID** — Titolo — stato`
      const filtered = listSlice
        .split('\n')
        .filter(line => {
          if (!line.startsWith('- ')) return false
          return line.match(new RegExp(` — ${stato}$`)) !== null
        })
        .join('\n')

      return {
        content: [{ type: 'text', text: filtered }]
      }
    }
  })
}
