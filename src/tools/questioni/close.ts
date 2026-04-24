import { z } from 'zod'
import { readFile, writeFile } from 'node:fs/promises'
import { registerTool, type ToolResult } from '../../server.js'
import { processText } from '../../enrichments/redazionale/pipeline.js'
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
import { today } from '../../operations/date.js'

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

      // Elaborazione redazionale dei campi di testo libero
      const titolo = await processText(parsed.titolo)
      const percorso = parsed.percorso
        ? await processText(parsed.percorso)
        : undefined
      const decisioni = await processText(parsed.decisioni)
      const impatto = await processText(parsed.impatto)

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

      // --- Fase 2: preparazione trasformazioni in memoria ---

      const date = today()

      // 2a. Prepara entry mastro
      const mastroOffset = findAfterTitleOffset(mastroTree)

      let entry = `\n\n## ${date} — Chiusura ${parsed.id}: ${titolo}\n\n`
      entry += `**Questione**: ${parsed.id} — ${titolo}\n\n`

      if (percorso && !isCompressioneActive()) {
        entry += `**Percorso**\n\n${percorso}\n\n`
      }

      entry += `**Decisioni prese**\n\n${decisioni}\n\n`
      entry += `**Impatto**\n\n${impatto}\n\n---\n`

      const mastroResult = insertAt(mastroContent, mastroOffset, entry)

      // 2b. Prepara rimozione da questioni.md
      let questioniResult = questioniContent

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

      const questioniTree2 = parseMarkdown(questioniResult)

      const block2 = findBlockByHeadingId(questioniTree2, parsed.id)
      if (block2) {
        const breakInfo = findThematicBreakAfterBlock(
          questioniResult,
          block2.endOffset
        )
        if (!breakInfo) {
          return {
            content: [{
              type: 'text',
              text: `Separatore --- non trovato dopo il blocco ` +
                `${parsed.id}. Struttura del file non conforme. ` +
                'Operazione annullata, nessun file modificato.'
            }],
            isError: true
          }
        }
        questioniResult = replaceRange(
          questioniResult,
          block2.startOffset,
          breakInfo.end,
          ''
        )
      }

      // --- Fase 3: scrittura sequenziale ---
      // Entrambe le trasformazioni sono pronte in memoria.
      // Scriviamo il mastro per primo: se fallisce, nessun
      // file è stato modificato. Se la seconda scrittura
      // fallisce, l'errore documenta lo stato.

      await writeFile(mastroPath(), mastroResult, 'utf-8')

      try {
        await writeFile(questioniPath(), questioniResult, 'utf-8')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return {
          content: [{
            type: 'text',
            text: `ATTENZIONE: l'entry nel mastro è stata scritta ` +
              `per ${parsed.id}, ma la rimozione da questioni.md ` +
              `è fallita: ${msg}. Verificare e correggere ` +
              'manualmente questioni.md.'
          }],
          isError: true
        }
      }

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
