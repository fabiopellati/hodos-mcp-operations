import path from 'node:path'
import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { readAndParse } from '../../operations/atomic.js'
import { stringifyMarkdown } from '../../parser/markdown.js'
import { getHeadingText } from '../../parser/sections.js'
import { validateStrings } from '../../operations/validate.js'
import type { Root, Heading } from 'mdast'

const basePath = process.env.OPERA_BASE_PATH || '/opera'

function attivitaPath(unita: string): string {
  return path.join(basePath, 'documenti', 'unita', unita, 'attivita.md')
}

/** Cerca heading h2 che corrisponde a BL-{N} */
function findVoceByBlId(
  tree: Root,
  blId: number
): { startIndex: number; endIndex: number } | null {
  const prefix = `BL-${blId}`
  const children = tree.children

  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (node.type !== 'heading' || node.depth !== 2) continue
    const text = getHeadingText(node)
    if (!text.startsWith(prefix)) continue

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

/** Verifica se una voce contiene la sottosezione "### Consegna" */
function isChiusa(tree: Root, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    const node = tree.children[i]
    if (node.type === 'heading' && node.depth === 3) {
      const text = getHeadingText(node)
      if (text.startsWith('Consegna')) return true
    }
  }
  return false
}

export { findVoceByBlId }

export function registerAttivitaReadTools(): void {
  registerTool({
    name: 'read_voce_attivita',
    description:
      'Legge una voce di attività BL-N dall\'unità specificata. ' +
      'Restituisce il blocco completo della voce.',
    schema: z.object({
      unita: z.string(),
      bl_id: z.number()
    }),
    category: 'conditional',
    requiredEnrichments: ['fasi-p0-p4'],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { unita, bl_id } = z.object({
        unita: z.string(),
        bl_id: z.number()
      }).parse(params)
      validateStrings({ unita })

      const tree = await readAndParse(attivitaPath(unita))
      const block = findVoceByBlId(tree, bl_id)

      if (!block) {
        return {
          content: [{
            type: 'text',
            text: `Voce BL-${bl_id} non trovata nell'unità "${unita}".`
          }],
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
    name: 'list_voci_attivita',
    description:
      'Elenca tutte le voci BL-N dell\'unità specificata ' +
      'con titolo e stato (aperta/chiusa).',
    schema: z.object({ unita: z.string() }),
    category: 'conditional',
    requiredEnrichments: ['fasi-p0-p4'],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { unita } = z.object({ unita: z.string() }).parse(params)
      validateStrings({ unita })

      const tree = await readAndParse(attivitaPath(unita))

      const voci: Array<{ id: string; titolo: string; stato: string }> = []

      for (let i = 0; i < tree.children.length; i++) {
        const node = tree.children[i]
        if (node.type !== 'heading' || node.depth !== 2) continue
        const text = getHeadingText(node)
        const match = text.match(/^BL-(\d+)\s*—\s*(.+)$/)
        if (!match) continue

        // Trova fine sezione
        let endIndex = tree.children.length
        for (let j = i + 1; j < tree.children.length; j++) {
          if (tree.children[j].type === 'heading' &&
              (tree.children[j] as Heading).depth <= 2) {
            endIndex = j
            break
          }
        }

        const stato = isChiusa(tree, i, endIndex) ? 'chiusa' : 'aperta'
        voci.push({ id: `BL-${match[1]}`, titolo: match[2], stato })
      }

      if (voci.length === 0) {
        return {
          content: [{
            type: 'text',
            text: `Nessuna voce di attività trovata nell'unità "${unita}".`
          }]
        }
      }

      const lines = voci.map(v => `- ${v.id} — ${v.titolo} [${v.stato}]`)
      return {
        content: [{ type: 'text', text: lines.join('\n') }]
      }
    }
  })
}
