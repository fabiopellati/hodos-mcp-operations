import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { readRaw } from '../../operations/atomic.js'
import { parseMarkdown } from '../../parser/markdown.js'
import { findIndexTable, getHeadingText } from '../../parser/sections.js'
import { notesPath } from '../../config/paths.js'
import type { Root } from 'mdast'

/**
 * Trova il blocco di una nota per ID (offset nella stringa originale).
 * Il blocco va dall'heading h2 al prossimo heading h2 o alla fine del documento.
 */
export function findNotaBlock(
  tree: Root,
  id: string
): { startIndex: number; endIndex: number; startOffset: number; endOffset: number } | null {
  const children = tree.children

  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (node.type !== 'heading' || node.depth !== 2) continue
    if (!getHeadingText(node).includes(id)) continue

    let endIndex = children.length
    for (let j = i + 1; j < children.length; j++) {
      const sibling = children[j]
      if ((sibling.type === 'heading' && sibling.depth <= 2) ||
          sibling.type === 'thematicBreak') {
        endIndex = j
        break
      }
    }

    const startOffset = node.position?.start.offset ?? 0
    const endOffset = endIndex < children.length
      ? (children[endIndex].position?.start.offset ?? 0)
      : (tree.position?.end.offset ?? 0)

    return { startIndex: i, endIndex, startOffset, endOffset }
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
      const content = await readRaw(notesPath())
      const tree = parseMarkdown(content)
      const result = findIndexTable(tree)
      if (!result) {
        return {
          content: [{ type: 'text', text: 'Tabella indice non trovata.' }],
          isError: true
        }
      }
      return {
        content: [{ type: 'text', text: content.slice(result.startOffset, result.endOffset) }]
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
      const content = await readRaw(notesPath())
      const tree = parseMarkdown(content)
      const block = findNotaBlock(tree, id)
      if (!block) {
        return {
          content: [{ type: 'text', text: `Nota ${id} non trovata.` }],
          isError: true
        }
      }
      return {
        content: [{ type: 'text', text: content.slice(block.startOffset, block.endOffset) }]
      }
    }
  })
}
