import path from 'node:path'
import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { readAndParse } from '../../operations/atomic.js'
import { stringifyMarkdown } from '../../parser/markdown.js'
import {
  findIndexTable,
  findBlockById,
  getHeadingText
} from '../../parser/sections.js'
import { validateEnum } from '../../operations/validate.js'
import { VALID_STATES } from '../../operations/validate.js'
import type { Root, Table, TableRow } from 'mdast'
import { toString } from 'mdast-util-to-string'

const basePath = process.env.OPERA_BASE_PATH || '/opera'
const questioniPath = () => path.join(basePath, 'questioni.md')

function serializeTable(table: Table): string {
  const tree: Root = { type: 'root', children: [table] }
  return stringifyMarkdown(tree)
}

function getCellText(row: TableRow, index: number): string {
  if (index >= row.children.length) return ''
  return toString(row.children[index])
}

/**
 * Trova il blocco di una questione per ID.
 * Il blocco va dall'heading h2 al thematicBreak escluso.
 */
function findQuestioneBlock(
  tree: Root,
  id: string
): { startIndex: number; endIndex: number } | null {
  const children = tree.children

  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (node.type !== 'heading' || node.depth !== 2) continue
    if (!getHeadingText(node).includes(id)) continue

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
      const tree = await readAndParse(questioniPath())
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
    name: 'read_questione',
    description:
      'Restituisce il contenuto di una questione per ID (heading h2 fino al separatore --- escluso).',
    schema: z.object({ id: z.string() }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { id } = z.object({ id: z.string() }).parse(params)
      const tree = await readAndParse(questioniPath())
      const block = findQuestioneBlock(tree, id)
      if (!block) {
        return {
          content: [{ type: 'text', text: `Questione ${id} non trovata.` }],
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

      const tree = await readAndParse(questioniPath())
      const result = findIndexTable(tree)
      if (!result) {
        return {
          content: [{ type: 'text', text: 'Tabella indice non trovata.' }],
          isError: true
        }
      }

      const { table } = result
      // La prima riga è l'header
      const header = table.children[0]
      const dataRows = table.children.slice(1)

      const filtered = stato
        ? dataRows.filter(row => getCellText(row, 2).trim() === stato)
        : dataRows

      const filteredTable: Table = {
        type: 'table',
        align: table.align,
        children: [header, ...filtered] as TableRow[]
      }

      return {
        content: [{ type: 'text', text: serializeTable(filteredTable) }]
      }
    }
  })
}
