import path from 'node:path'
import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { atomicFileOperation } from '../../operations/atomic.js'
import { parseMarkdown } from '../../parser/markdown.js'
import {
  findIndexTable,
  findInsertionPointAfterIndex
} from '../../parser/sections.js'
import { validateStrings } from '../../operations/validate.js'
import { formatCommentoHeader, formatNotaAutore } from '../../enrichments/firma.js'
import { findNotaBlock } from './read.js'
import type { Root, TableRow, TableCell, Text } from 'mdast'
import { toString } from 'mdast-util-to-string'

const basePath = process.env.OPERA_BASE_PATH || '/opera'
const notesPath = () => path.join(basePath, 'notes.md')

const today = () => new Date().toISOString().slice(0, 10)

function padId(num: number): string {
  return String(num).padStart(3, '0')
}

function makeTextCell(text: string): TableCell {
  return {
    type: 'tableCell',
    children: [{ type: 'text', value: text } as Text]
  }
}

function makeTableRow(cells: string[]): TableRow {
  return {
    type: 'tableRow',
    children: cells.map(makeTextCell)
  }
}

function readNotaCounter(tree: Root): number {
  for (const node of tree.children) {
    if (node.type !== 'blockquote') continue
    const text = toString(node)
    if (!text.includes('Ultima nota inserita')) continue

    const match = text.match(/NOTA-(\d+)/)
    if (match) return parseInt(match[1], 10)
    return 0
  }
  return 0
}

function updateNotaCounter(tree: Root, value: string): void {
  for (const node of tree.children) {
    if (node.type !== 'blockquote') continue
    const text = toString(node)
    if (!text.includes('Ultima nota inserita')) continue

    const paragraph = node.children[0]
    if (paragraph && paragraph.type === 'paragraph') {
      paragraph.children = [{
        type: 'text',
        value: `Ultima nota inserita: ${value}`
      } as Text]
    }
    return
  }
}

function countComments(
  children: Root['children'],
  startIndex: number,
  endIndex: number
): number {
  let count = 0
  for (let i = startIndex; i < endIndex; i++) {
    const text = toString(children[i])
    const matches = text.match(/COMMENTO-\d+/g)
    if (matches) {
      count = Math.max(
        count,
        ...matches.map(m => parseInt(m.replace('COMMENTO-', ''), 10))
      )
    }
  }
  return count
}

function findBodyInsertionPoint(tree: Root): number {
  const insertionAfterIndex = findInsertionPointAfterIndex(tree)

  for (let i = insertionAfterIndex; i < tree.children.length; i++) {
    if (tree.children[i].type === 'thematicBreak') {
      return i + 1
    }
  }
  return tree.children.length
}

export function registerNotesWriteTools(): void {
  registerTool({
    name: 'create_nota',
    description:
      'Crea una nuova nota in notes.md con riga indice, blocco corpo e aggiornamento contatore.',
    schema: z.object({
      descrizione: z.string(),
      corpo: z.string(),
      firma: z.string().optional()
    }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { descrizione, corpo, firma } = z.object({
        descrizione: z.string(),
        corpo: z.string(),
        firma: z.string().optional()
      }).parse(params)
      validateStrings({ descrizione, corpo })

      await atomicFileOperation(notesPath(), (tree) => {
        const lastNum = readNotaCounter(tree)
        const nextNum = lastNum + 1
        const id = `NOTA-${padId(nextNum)}`
        const date = today()

        // Inserisci riga nell'indice (in cima, dopo l'header)
        const indexResult = findIndexTable(tree)
        if (indexResult) {
          const { table } = indexResult
          const newRow = makeTableRow([id, descrizione, date])
          table.children.splice(1, 0, newRow)
        }

        // Costruisci blocco corpo
        const autore = formatNotaAutore(firma)
        const autoreBlock = autore ? `${autore}\n\n` : ''
        const body = `## ${id} — ${date} — ${descrizione}\n\n${autoreBlock}${corpo}\n`
        const bodyTree = parseMarkdown(body)

        // Inserisci dopo l'indice e il separatore
        const insertPoint = findBodyInsertionPoint(tree)
        tree.children.splice(insertPoint, 0, ...bodyTree.children)

        // Aggiorna contatore
        updateNotaCounter(tree, `${id} — ${date}.`)

        return tree
      })

      return {
        content: [{ type: 'text', text: `Nota creata.` }]
      }
    }
  })

  registerTool({
    name: 'add_commento_nota',
    description:
      'Aggiunge un commento (COMMENTO-NNN) in fondo a una nota.',
    schema: z.object({
      id: z.string(),
      testo: z.string(),
      firma: z.string().optional()
    }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { id, testo, firma } = z.object({
        id: z.string(),
        testo: z.string(),
        firma: z.string().optional()
      }).parse(params)
      validateStrings({ testo })

      await atomicFileOperation(notesPath(), (tree) => {
        const block = findNotaBlock(tree, id)
        if (!block) throw new Error(`Nota ${id} non trovata.`)

        const date = today()
        const lastComment = countComments(tree.children, block.startIndex, block.endIndex)
        const commentId = `COMMENTO-${padId(lastComment + 1)}`

        // Verifica se esiste già la sezione Commenti
        let commentiExists = false
        for (let i = block.startIndex; i < block.endIndex; i++) {
          if (tree.children[i].type === 'paragraph' &&
              toString(tree.children[i]).startsWith('**Commenti**')) {
            commentiExists = true
            break
          }
        }

        const commentBody = `${formatCommentoHeader(commentId, date, firma)}\n${testo}`
        const commentNodes = parseMarkdown(commentBody).children

        if (commentiExists) {
          tree.children.splice(block.endIndex, 0, ...commentNodes)
        } else {
          const sectionHeader = parseMarkdown('**Commenti**').children
          tree.children.splice(block.endIndex, 0, ...sectionHeader, ...commentNodes)
        }

        return tree
      })

      return {
        content: [{ type: 'text', text: `Commento aggiunto a ${id}.` }]
      }
    }
  })
}
