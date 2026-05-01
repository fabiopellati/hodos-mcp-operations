import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { processText } from '../../enrichments/redazionale/pipeline.js'
import { atomicFileOperation, insertAt, replaceRange } from '../../operations/atomic.js'
import { parseMarkdown } from '../../parser/markdown.js'
import {
  findIndexList,
  findFirstListItemOffset,
  findBodyInsertOffset,
  findLineByPattern,
  findLineByPatternInRange,
  findLastLineByPatternInRange
} from '../../parser/sections.js'
import { validateStrings } from '../../operations/validate.js'
import { formatCommentoHeader, formatNotaAutore } from '../../enrichments/firma.js'
import { notesPath } from '../../config/paths.js'
import { today } from '../../operations/date.js'
import { findNotaBlock } from './read.js'

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
      const { descrizione: rawDescrizione, corpo: rawCorpo, firma } = z.object({
        descrizione: z.string(),
        corpo: z.string(),
        firma: z.string().optional()
      }).parse(params)
      validateStrings({ descrizione: rawDescrizione, corpo: rawCorpo })

      const descrizione = await processText(rawDescrizione)
      const corpo = await processText(rawCorpo)

      await atomicFileOperation(notesPath(), (content, tree) => {
        const lastNum = readNotaCounterFromString(content)
        const nextNum = lastNum + 1
        const id = `NOTA-${padId(nextNum)}`
        const date = today()

        let result = content

        // 1. Inserisci riga nell'indice (in cima all'elenco)
        const indexResult = findIndexList(tree)
        if (indexResult) {
          const { offset: rowOffset, needsNewline } = findFirstListItemOffset(indexResult)
          const newRow = `${needsNewline ? '\n' : ''}- **${id}** — ${descrizione} — ${date}\n`
          result = insertAt(result, rowOffset, newRow)

          // Ri-parsa dopo l'inserimento per offset corretti
          const tree2 = parseMarkdown(result)

          // 2. Inserisci blocco corpo dopo l'indice e il separatore
          const bodyOffset = findBodyInsertOffset(tree2)
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
      const { id, testo: rawTesto, firma } = z.object({
        id: z.string(),
        testo: z.string(),
        firma: z.string().optional()
      }).parse(params)
      validateStrings({ testo: rawTesto })

      const testo = await processText(rawTesto)

      await atomicFileOperation(notesPath(), (content, tree) => {
        const block = findNotaBlock(tree, id)
        if (!block) throw new Error(`Nota ${id} non trovata.`)

        const date = today()
        const lastComment = countCommentsInRange(
          content, block.startOffset, block.endOffset
        )
        const commentId = `COMMENTO-${padId(lastComment + 1)}`

        const commentBody = `\n${formatCommentoHeader(commentId, date, firma)}\n${testo}\n\n`

        // A-05: trova l'ultimo thematicBreak nel blocco nota per inserire
        // il commento prima di esso (in fondo al corpo, dopo le sezioni interne).
        const children = tree.children
        let lastHrOffset: number | null = null
        for (let i = block.startIndex + 1; i < block.endIndex; i++) {
          if (children[i].type === 'thematicBreak') {
            lastHrOffset = children[i].position?.start.offset ?? null
          }
        }
        const insertOffset = lastHrOffset !== null ? lastHrOffset : block.endOffset

        // Verifica se esiste già la sezione Commenti nel blocco
        const commentiLine = findLineByPatternInRange(
          content, /^### Commenti/, block.startOffset, insertOffset
        )

        if (commentiLine) {
          return insertAt(content, insertOffset, commentBody)
        }

        // A-05: usa ### Commenti (sezione di secondo livello relativa alla nota H2)
        const sectionBlock = `\n### Commenti\n${commentBody}`
        return insertAt(content, insertOffset, sectionBlock)
      })

      return {
        content: [{ type: 'text', text: `Commento aggiunto a ${id}.` }]
      }
    }
  })
}
