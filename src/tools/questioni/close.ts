import { z } from 'zod'
import { readFile, writeFile } from 'node:fs/promises'
import { registerTool, type ToolResult } from '../../server.js'
import { parseMarkdown } from '../../parser/markdown.js'
import {
  findIndexTable,
  findBlockByHeadingId,
  findLineByPatternInRange,
  findAfterTitleOffset
} from '../../parser/sections.js'
import {
  insertAt,
  replaceRange
} from '../../operations/atomic.js'
import { validateStrings } from '../../operations/validate.js'
import { isCompressioneActive, isPercorsoRequired } from '../../enrichments/compressione.js'
import { questioniPath, mastroPath } from '../../config/paths.js'

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Trova il thematicBreak (---) alla fine di un blocco questione.
 */
function findThematicBreakAfterBlock(
  content: string,
  blockEndOffset: number
): { start: number; end: number } | null {
  const slice = content.slice(blockEndOffset, blockEndOffset + 20)
  const m = slice.match(/^-{3,}\n?/)
  if (m) {
    return {
      start: blockEndOffset,
      end: blockEndOffset + m[0].length
    }
  }
  return null
}

export function registerCloseQuestioneTools(): void {
  registerTool({
    name: 'close_questione',
    description:
      'Chiude una questione in modo atomico: crea l\'entry nel mastro ' +
      'e rimuove la questione da questioni.md. La questione deve ' +
      'essere in stato "closed" prima dell\'invocazione. Per la ' +
      'chiusura ordinaria usare sempre questo tool.',
    schema: z.object({
      id: z.string(),
      titolo: z.string(),
      percorso: z.string().optional(),
      decisioni: z.string(),
      impatto: z.string()
    }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const parsed = z.object({
        id: z.string(),
        titolo: z.string(),
        percorso: z.string().optional(),
        decisioni: z.string(),
        impatto: z.string()
      }).parse(params)

      validateStrings({
        titolo: parsed.titolo,
        decisioni: parsed.decisioni,
        impatto: parsed.impatto
      })

      if (!parsed.percorso && isPercorsoRequired()) {
        return {
          content: [{
            type: 'text',
            text: 'Il campo "percorso" è obbligatorio quando ' +
              'l\'arricchimento "compressione-mastro" non è attivo.'
          }],
          isError: true
        }
      }

      // --- Fase 1: lettura e validazione di entrambi i file ---

      const questioniContent = await readFile(questioniPath(), 'utf-8')
      const questioniTree = parseMarkdown(questioniContent)

      const block = findBlockByHeadingId(questioniTree, parsed.id)
      if (!block) {
        return {
          content: [{
            type: 'text',
            text: `Questione ${parsed.id} non trovata in questioni.md.`
          }],
          isError: true
        }
      }

      // Verifica stato closed
      const statoLine = findLineByPatternInRange(
        questioniContent,
        /\*\*Stato\*\*:\s*([a-z-]+)/,
        block.startOffset,
        block.endOffset
      )
      if (!statoLine) {
        return {
          content: [{
            type: 'text',
            text: `Campo Stato non trovato in ${parsed.id}.`
          }],
          isError: true
        }
      }

      const statoCorrente = statoLine.match[1]
      if (statoCorrente !== 'closed') {
        return {
          content: [{
            type: 'text',
            text: `${parsed.id} è in stato "${statoCorrente}". ` +
              'La questione deve essere in stato "closed" prima ' +
              'della chiusura. Usare update_stato per portarla ' +
              'a "closed".'
          }],
          isError: true
        }
      }

      // Verifica duplicato nel mastro
      const mastroContent = await readFile(mastroPath(), 'utf-8')
      const mastroTree = parseMarkdown(mastroContent)

      const existingEntry = findBlockByHeadingId(mastroTree, parsed.id)
      if (existingEntry) {
        return {
          content: [{
            type: 'text',
            text: `Esiste già un'entry nel mastro per ` +
              `${parsed.id}. Chiusura annullata per evitare ` +
              'duplicazione.'
          }],
          isError: true
        }
      }

      // --- Fase 2: scrittura mastro ---

      const date = today()
      const mastroOffset = findAfterTitleOffset(mastroTree)

      let entry = `\n\n## ${date} — Chiusura ${parsed.id}: ${parsed.titolo}\n\n`
      entry += `**Questione**: ${parsed.id} — ${parsed.titolo}\n\n`

      if (parsed.percorso && !isCompressioneActive()) {
        entry += `**Percorso**\n\n${parsed.percorso}\n\n`
      }

      entry += `**Decisioni prese**\n\n${parsed.decisioni}\n\n`
      entry += `**Impatto**\n\n${parsed.impatto}\n\n---\n`

      let mastroResult = insertAt(mastroContent, mastroOffset, entry)

      // Rimuovi eventuale thematicBreak duplicato
      const insertedEnd = mastroOffset + entry.length
      const afterInsert = mastroResult.slice(insertedEnd).replace(/^\n*/, '')
      if (afterInsert.startsWith('---')) {
        const breakStart = insertedEnd +
          (mastroResult.length - insertedEnd - afterInsert.length)
        const breakEnd = breakStart + 3
        let removeEnd = breakEnd
        while (
          removeEnd < mastroResult.length &&
          mastroResult[removeEnd] === '\n'
        ) {
          removeEnd++
        }
        mastroResult = mastroResult.slice(0, breakStart) +
          mastroResult.slice(removeEnd)
      }

      await writeFile(mastroPath(), mastroResult, 'utf-8')

      // --- Fase 3: rimozione da questioni.md ---

      // Rileggi questioni.md (il file non è cambiato, ma usiamo
      // il contenuto già in memoria per coerenza)
      let questioniResult = questioniContent

      // Rimuovi riga dall'indice
      const indexInfo = findIndexTable(questioniTree)
      if (indexInfo) {
        const tableRow = findLineByPatternInRange(
          questioniResult,
          new RegExp(`\\|\\s*${parsed.id}\\s*\\|`),
          indexInfo.startOffset,
          indexInfo.endOffset
        )
        if (tableRow) {
          questioniResult = replaceRange(
            questioniResult,
            tableRow.lineStart,
            tableRow.lineEnd,
            ''
          )
        }
      }

      // Ri-parsa dopo rimozione riga indice
      const questioniTree2 = parseMarkdown(questioniResult)

      // Rimuovi blocco corpo
      const block2 = findBlockByHeadingId(questioniTree2, parsed.id)
      if (block2) {
        const breakInfo = findThematicBreakAfterBlock(
          questioniResult,
          block2.endOffset
        )
        const removeEnd = breakInfo ? breakInfo.end : block2.endOffset
        questioniResult = replaceRange(
          questioniResult,
          block2.startOffset,
          removeEnd,
          ''
        )
      }

      await writeFile(questioniPath(), questioniResult, 'utf-8')

      return {
        content: [{
          type: 'text',
          text: `${parsed.id} chiusa: entry creata nel mastro, ` +
            'questione rimossa da questioni.md.'
        }]
      }
    }
  })
}
