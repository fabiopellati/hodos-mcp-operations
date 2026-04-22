import path from 'node:path'
import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { readAndParse } from '../../operations/atomic.js'
import { stringifyMarkdown } from '../../parser/markdown.js'
import { findIndexTable, getHeadingText } from '../../parser/sections.js'
import type { Root, Table } from 'mdast'

const basePath = process.env.OPERA_BASE_PATH || '/opera'
const notesPath = () => path.join(basePath, 'notes.md')

function serializeTable(table: Table): string {
  const tree: Root = { type: 'root', children: [table] }
  return stringifyMarkdown(tree)
}

/**
 * Trova il blocco di una nota per ID.
 * Il blocco va dall'heading h2 al prossimo heading h2 o alla fine del documento.
 */
export function findNotaBlock(
  tree: Root,
  id: string
): { startIndex: number; endIndex: number } | null {
  const children = tree.children

  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (node.type !== 'heading' || node.depth !== 2) continue
    if (!getHeadingText(node).includes(id)) continue

    let endIndex = children.length
    for (let j = i + 1; j < children.length; j++) {
      const sibling = children[j]
      if (sibling.type === 'heading' && sibling.depth <= 2) {
        endIndex = j
        break
      }
    }

    return { startIndex: i, endIndex }
  }

  return null
}

export function registerNotesReadTools(): void {
  registerTool({
    name: 'read_notes_index',
    description:
      'Restituisce la tabella indice di notes.md serializzata in markdown.',
    schema: z.object({}),
    category: 'base',
    requiredEnrichments: [],
    handler: async (): Promise<ToolResult> => {
      const tree = await readAndParse(notesPath())
      const result = findIndexTable(tree)
      if (!result) {
        return {
          content: [{ type: 'text', text: 'Tabella indice non trovata.' }],
          isError: true
        }
      }
      return {
        content: [{ type: 'text', text: serializeTable(result.table) }]
      }
    }
  })

  registerTool({
    name: 'read_nota',
    description:
      'Restituisce il blocco completo di una nota per ID (NOTA-NNN).',
    schema: z.object({ id: z.string() }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { id } = z.object({ id: z.string() }).parse(params)
      const tree = await readAndParse(notesPath())
      const block = findNotaBlock(tree, id)
      if (!block) {
        return {
          content: [{ type: 'text', text: `Nota ${id} non trovata.` }],
          isError: true
        }
      }
      const subtree: Root = {
        type: 'root',
        children: tree.children.slice(block.startIndex, block.endIndex)
      }
      return {
        content: [{ type: 'text', text: stringifyMarkdown(subtree) }]
      }
    }
  })
}
