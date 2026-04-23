import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { readRaw } from '../../operations/atomic.js'
import { parseMarkdown } from '../../parser/markdown.js'
import { findBlockByHeadingId, getHeadingText } from '../../parser/sections.js'
import { mastroPath } from '../../config/paths.js'

export function registerMastroReadTools(): void {
  registerTool({
    name: 'read_entry',
    description:
      'Cerca un\'entry nel mastro per ID questione e restituisce il blocco fino al separatore ---.',
    schema: z.object({ questione_id: z.string() }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { questione_id } = z.object({ questione_id: z.string() }).parse(params)
      const content = await readRaw(mastroPath())
      const tree = parseMarkdown(content)
      const block = findBlockByHeadingId(tree, questione_id)
      if (!block) {
        return {
          content: [{ type: 'text', text: `Entry per ${questione_id} non trovata nel mastro.` }],
          isError: true
        }
      }
      return {
        content: [{ type: 'text', text: content.slice(block.startOffset, block.endOffset) }]
      }
    }
  })

  registerTool({
    name: 'read_entries',
    description:
      'Restituisce le prime N entry del mastro (le più recenti, in cima). Default: 10.',
    schema: z.object({ limit: z.number().int().min(1).optional() }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { limit } = z.object({ limit: z.number().int().min(1).optional() }).parse(params)
      const maxEntries = limit ?? 10
      const content = await readRaw(mastroPath())
      const tree = parseMarkdown(content)
      const children = tree.children

      const entries: Array<{ startOffset: number; endOffset: number }> = []

      for (let i = 0; i < children.length && entries.length < maxEntries; i++) {
        const node = children[i]
        if (node.type !== 'heading' || node.depth !== 2) continue

        // Trova la fine: il prossimo thematicBreak
        let endIndex = children.length
        for (let j = i + 1; j < children.length; j++) {
          if (children[j].type === 'thematicBreak') {
            endIndex = j
            break
          }
        }

        const startOffset = node.position?.start.offset ?? 0
        const endOffset = endIndex < children.length
          ? (children[endIndex].position?.end.offset ?? 0)
          : (tree.position?.end.offset ?? content.length)

        entries.push({ startOffset, endOffset })
      }

      if (entries.length === 0) {
        return {
          content: [{ type: 'text', text: 'Nessuna entry nel mastro.' }]
        }
      }

      const text = entries
        .map(e => content.slice(e.startOffset, e.endOffset))
        .join('\n\n')

      return {
        content: [{ type: 'text', text }]
      }
    }
  })
}
