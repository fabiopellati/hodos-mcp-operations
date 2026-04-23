import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { atomicFileOperation, insertAt, replaceRange } from '../../operations/atomic.js'
import {
  findIndexTable,
  findFirstDataRowOffset,
  findBodyInsertOffset,
  findLineByPattern,
  findLineByPatternInRange,
  findLastLineByPatternInRange
} from '../../parser/sections.js'
import { validateStrings } from '../../operations/validate.js'
import { formatCommentoHeader, formatNotaAutore } from '../../enrichments/firma.js'
import { notesPath } from '../../config/paths.js'
import { findNotaBlock } from './read.js'

const today = () => new Date().toISOString().slice(0, 10)

function padId(num: number): string {
  return String(num).padStart(3, '0')
}

function readNotaCounterFromString(content: string): number {
  const match = content.match(/>\s*Ultima nota inserita:\s*NOTA-(\d+)/)
  if (match) return parseInt(match[1], 10)
  return 0
}

function updateNotaCounterInString(content: string, newValue: string): string {
  return content.replace(
    /(>\s*Ultima nota inserita:\s*).*/,
    `$1${newValue}`
  )
}

function countCommentsInRange(content: string, start: number, end: number): number {
  const slice = content.slice(start, end)
  const matches = slice.match(/COMMENTO-(\d+)/g)
  if (!matches) return 0
  return Math.max(
    ...matches.map(m => parseInt(m.replace('COMMENTO-', ''), 10))
  )
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

      await atomicFileOperation(notesPath(), (content, tree) => {
        const lastNum = readNotaCounterFromString(content)
        const nextNum = lastNum + 1
        const id = `NOTA-${padId(nextNum)}`
        const date = today()

        let result = content

        // 1. Inserisci riga nell'indice (in cima, dopo l'header)
        const indexResult = findIndexTable(tree)
        if (indexResult) {
          const { offset: rowOffset, needsNewline } = findFirstDataRowOffset(indexResult.table)
          const newRow = `${needsNewline ? '\n' : ''}| ${id} | ${descrizione} | ${date} |\n`
          result = insertAt(result, rowOffset, newRow)
          // Dopo l'inserimento, tutti gli offset successivi shiftano di newRow.length
          const shift = newRow.length

          // 2. Inserisci blocco corpo dopo l'indice e il separatore
          const bodyOffset = findBodyInsertOffset(tree) + shift
          const autore = formatNotaAutore(firma)
          const autoreBlock = autore ? `${autore}\n\n` : ''
          const bodyBlock = `\n## ${id} — ${date} — ${descrizione}\n\n${autoreBlock}${corpo}\n\n---\n`
          result = insertAt(result, bodyOffset, bodyBlock)
        }

        // 3. Aggiorna contatore
        result = updateNotaCounterInString(result, `${id} — ${date}.`)

        return result
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

      await atomicFileOperation(notesPath(), (content, tree) => {
        const block = findNotaBlock(tree, id)
        if (!block) throw new Error(`Nota ${id} non trovata.`)

        const date = today()
        const lastComment = countCommentsInRange(
          content, block.startOffset, block.endOffset
        )
        const commentId = `COMMENTO-${padId(lastComment + 1)}`

        const commentBody = `\n${formatCommentoHeader(commentId, date, firma)}\n${testo}\n\n`

        // Verifica se esiste già la sezione Commenti nel blocco
        const commentiLine = findLineByPatternInRange(
          content, /^\*\*Commenti\*\*/, block.startOffset, block.endOffset
        )

        if (commentiLine) {
          // Inserisci il commento prima della fine del blocco
          return insertAt(content, block.endOffset, commentBody)
        }

        // Se la sezione Commenti non esiste, creala prima della fine del blocco
        const sectionBlock = `\n**Commenti**\n${commentBody}`
        return insertAt(content, block.endOffset, sectionBlock)
      })

      return {
        content: [{ type: 'text', text: `Commento aggiunto a ${id}.` }]
      }
    }
  })
}
