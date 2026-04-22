import path from 'node:path'
import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { readAndParse } from '../../operations/atomic.js'
import { stringifyMarkdown } from '../../parser/markdown.js'
import { getHeadingText } from '../../parser/sections.js'
import type { Root } from 'mdast'

const basePath = process.env.OPERA_BASE_PATH || '/opera'
const mastroPath = () => path.join(basePath, 'mastro.md')

/**
 * Trova un'entry nel mastro per ID questione.
 * Le entry sono delimitate da thematicBreak.
 */
function findEntryByQuestioneId(
  tree: Root,
  questioneId: string
): { startIndex: number; endIndex: number } | null {
  const children = tree.children

  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (node.type !== 'heading' || node.depth !== 2) continue
    if (!getHeadingText(node).includes(questioneId)) continue

    // Trova la fine: il prossimo thematicBreak
    let endIndex = children.length
    for (let j = i + 1; j < children.length; j++) {
      if (children[j].type === 'thematicBreak') {
        endIndex = j
        break
      }
    }

    return { startIndex: i, endIndex }
  }

  return null
}

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
      const tree = await readAndParse(mastroPath())
      const block = findEntryByQuestioneId(tree, questione_id)
      if (!block) {
        return {
          content: [{ type: 'text', text: `Entry per ${questione_id} non trovata nel mastro.` }],
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
      const tree = await readAndParse(mastroPath())
      const children = tree.children

      const entries: Array<{ startIndex: number; endIndex: number }> = []

      for (let i = 0; i < children.length && entries.length < maxEntries; i++) {
        const node = children[i]
        if (node.type !== 'heading' || node.depth !== 2) continue

        let endIndex = children.length
        for (let j = i + 1; j < children.length; j++) {
          if (children[j].type === 'thematicBreak') {
            endIndex = j
            break
          }
        }
        entries.push({ startIndex: i, endIndex })
      }

      if (entries.length === 0) {
        return {
          content: [{ type: 'text', text: 'Nessuna entry nel mastro.' }]
        }
      }

      const allNodes = entries.flatMap(e =>
        [...tree.children.slice(e.startIndex, e.endIndex), { type: 'thematicBreak' as const }]
      )
      const subtree: Root = { type: 'root', children: allNodes }
      return {
        content: [{ type: 'text', text: stringifyMarkdown(subtree) }]
      }
    }
  })
}
