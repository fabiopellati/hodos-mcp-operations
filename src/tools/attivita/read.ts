import path from 'node:path'
import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { readRaw } from '../../operations/atomic.js'
import { parseMarkdown } from '../../parser/markdown.js'
import { getHeadingText } from '../../parser/sections.js'
import { validateStrings } from '../../operations/validate.js'
import type { Root, Heading } from 'mdast'

const basePath = process.env.OPERA_BASE_PATH || '/opera'

function attivitaPath(unita: string): string {
  return path.join(basePath, 'documenti', 'unita', unita, 'attivita.md')
}

/** Offset di inizio di un nodo */
function nodeStart(node: { position?: { start: { offset?: number } } }): number {
  return node.position?.start.offset ?? 0
}

/** Offset di fine di un nodo */
function nodeEnd(node: { position?: { end: { offset?: number } } }): number {
  return node.position?.end.offset ?? 0
}

export interface VoceRange {
  startIndex: number
  endIndex: number
  startOffset: number
  endOffset: number
}

/** Cerca heading h2 che corrisponde a BL-{N} e restituisce offset */
export function findVoceByBlId(
  tree: Root,
  blId: number
): VoceRange | null {
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

    return {
      startIndex: i,
      endIndex,
      startOffset: nodeStart(node),
      endOffset: endIndex < children.length
        ? nodeStart(children[endIndex])
        : tree.position?.end.offset ?? 0
    }
  }

  return null
}

/** Verifica se nel range della stringa è presente "### Consegna" */
function isChiusa(content: string, startOffset: number, endOffset: number): boolean {
  const slice = content.slice(startOffset, endOffset)
  return /^### Consegna/m.test(slice)
}

export function registerAttivitaReadTools(): void {
  registerTool({
    name: 'read_voce_attivita',
    description:
      'Legge una voce di attività BL-N dall\'unità specificata. ' +
      'Restituisce il blocco completo della voce.',
    schema: z.object({
      unita: z.string(),
      bl_id: z.string()
    }),
    category: 'conditional',
    requiredEnrichments: ['fasi-p0-p4'],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { unita, bl_id } = z.object({
        unita: z.string(),
        bl_id: z.string()
      }).parse(params)
      validateStrings({ unita })

      const blMatch = bl_id.match(/^BL-(\d+)$/)
      if (!blMatch) {
        return {
          content: [{
            type: 'text',
            text: `Formato bl_id non valido: "${bl_id}". Atteso formato BL-N (es. "BL-3").`
          }],
          isError: true
        }
      }
      const blNum = parseInt(blMatch[1], 10)

      const content = await readRaw(attivitaPath(unita))
      const tree = parseMarkdown(content)
      const block = findVoceByBlId(tree, blNum)

      if (!block) {
        return {
          content: [{
            type: 'text',
            text: `Voce ${bl_id} non trovata nell'unità "${unita}".`
          }],
          isError: true
        }
      }

      return {
        content: [{ type: 'text', text: content.slice(block.startOffset, block.endOffset) }]
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

      const content = await readRaw(attivitaPath(unita))
      const tree = parseMarkdown(content)

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

        const startOffset = nodeStart(node)
        const endOffset = endIndex < tree.children.length
          ? nodeStart(tree.children[endIndex])
          : tree.position?.end.offset ?? content.length

        const stato = isChiusa(content, startOffset, endOffset) ? 'chiusa' : 'aperta'
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
