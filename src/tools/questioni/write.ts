import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { processText } from '../../enrichments/redazionale/pipeline.js'
import {
  atomicFileOperation,
  insertAt,
  replaceRange
} from '../../operations/atomic.js'
import { parseMarkdown } from '../../parser/markdown.js'
import {
  findIndexTable,
  findBodyInsertOffset,
  findFirstDataRowOffset,
  findLineByPattern,
  findLineByPatternInRange,
  findLastLineByPatternInRange,
  findBlockByHeadingId
} from '../../parser/sections.js'
import { validateStrings, validateEnum, VALID_STATES } from '../../operations/validate.js'
import { formatStoriaEntry, formatCommentoHeader } from '../../enrichments/firma.js'
import { questioniPath, resolveOperaPath } from '../../config/paths.js'
import { today } from '../../operations/date.js'
import type { Root } from 'mdast'

const VALID_TYPES = ['rilievo', 'revisione', 'anomalia'] as const

function padId(num: number): string {
  return String(num).padStart(3, '0')
}

/**
 * Legge il contatore "Ultima questione inserita" dal blockquote nella stringa.
 * Restituisce 0 se il contatore indica "---" o non e' presente.
 */
function readCounterFromString(content: string, label: string): number {
  const pattern = new RegExp(`${label}:\\s*(?:QUESTIONE-(\\d+))`)
  const m = content.match(pattern)
  if (m) return parseInt(m[1], 10)
  return 0
}

/**
 * Sostituisce il valore di un contatore blockquote nella stringa.
 * Restituisce la stringa aggiornata.
 */
function updateCounterInString(
  content: string,
  label: string,
  value: string
): string {
  const pattern = new RegExp(`(${label}:\\s*)([^\\n]*)`)
  return content.replace(pattern, `$1${value}`)
}

/**
 * Trova il thematicBreak (---) alla fine di un blocco questione.
 * Il blocco da findBlockByHeadingId termina prima del thematicBreak;
 * il break si trova al endOffset del blocco.
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

/**
 * Conta le occorrenze di un pattern nella stringa.
 */
function countOccurrences(content: string, pattern: RegExp): number {
  const globalPattern = new RegExp(pattern.source, 'g')
  const matches = content.match(globalPattern)
  return matches ? matches.length : 0
}

/**
 * Risolve il range di ricerca per una sezione, gestendo
 * l'ambiguità quando la sezione compare più volte nel file.
 *
 * - Se id è fornito: restringe al blocco della questione
 * - Se la sezione è univoca: restituisce il range dal label
 *   alla fine del file (o del blocco se presente)
 * - Se la sezione è ambigua e id è assente: lancia errore
 */
function resolveSectionRange(
  content: string,
  tree: Root,
  sezione: string,
  id?: string
): { searchStart: number; searchEnd: number } {
  const sectionPattern = new RegExp(`\\*\\*${sezione}\\*\\*`)

  if (id) {
    const block = findBlockByHeadingId(tree, id)
    if (!block) throw new Error(`Blocco ${id} non trovato.`)

    const label = findLineByPatternInRange(
      content, sectionPattern, block.startOffset, block.endOffset
    )
    if (!label) {
      throw new Error(
        `Sezione "${sezione}" non trovata in ${id}.`
      )
    }
    return { searchStart: label.lineEnd, searchEnd: block.endOffset }
  }

  // Nessun id: verifica unicità
  const occurrences = countOccurrences(content, sectionPattern)
  if (occurrences === 0) {
    throw new Error(`Sezione "${sezione}" non trovata.`)
  }
  if (occurrences > 1) {
    throw new Error(
      `Sezione "${sezione}" trovata ${occurrences} volte nel file. ` +
      'Specificare il parametro "id" per identificare il blocco ' +
      'contenitore (es. QUESTIONE-003).'
    )
  }

  const label = findLineByPattern(content, sectionPattern)
  if (!label) throw new Error(`Sezione "${sezione}" non trovata.`)
  return { searchStart: label.lineEnd, searchEnd: content.length }
}

export function registerQuestioniWriteTools(): void {
  registerTool({
    name: 'create_questione',
    description:
      'Crea una nuova questione in questioni.md con riga indice, blocco corpo e aggiornamento contatore.',
    schema: z.object({
      tipo: z.enum(VALID_TYPES),
      titolo: z.string(),
      descrizione: z.string(),
      domande_aperte: z.array(z.string()).optional(),
      impatto: z.array(z.object({
        artefatto: z.string(),
        descrizione: z.string()
      })).optional(),
      collegate: z.array(z.string()).optional(),
      firma: z.string().optional()
    }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const schema = z.object({
        tipo: z.enum(VALID_TYPES),
        titolo: z.string(),
        descrizione: z.string(),
        domande_aperte: z.array(z.string()).optional(),
        impatto: z.array(z.object({
          artefatto: z.string(),
          descrizione: z.string()
        })).optional(),
        collegate: z.array(z.string()).optional(),
        firma: z.string().optional()
      })
      const parsed = schema.parse(params)
      validateStrings({ titolo: parsed.titolo, descrizione: parsed.descrizione })

      // Elaborazione redazionale dei campi di testo libero
      const titolo = await processText(parsed.titolo)
      const descrizione = await processText(parsed.descrizione)
      const domande_aperte = parsed.domande_aperte
        ? await Promise.all(parsed.domande_aperte.map(d => processText(d)))
        : undefined
      const impatto = parsed.impatto
        ? await Promise.all(parsed.impatto.map(async imp => ({
            artefatto: imp.artefatto,
            descrizione: await processText(imp.descrizione)
          })))
        : undefined

      let createdId = ''

      await atomicFileOperation(questioniPath(), (content, tree) => {
        const lastNum = readCounterFromString(content, 'Ultima questione inserita')
        const nextNum = lastNum + 1
        const id = `QUESTIONE-${padId(nextNum)}`
        createdId = id
        const date = today()

        let result = content

        // 1. Inserisci riga nell'indice (in cima, dopo l'header)
        const indexInfo = findIndexTable(tree)
        if (indexInfo) {
          const { offset: rowOffset, needsNewline } = findFirstDataRowOffset(indexInfo.table)
          const newRow = `${needsNewline ? '\n' : ''}| ${id} | ${titolo} | open |\n`
          result = insertAt(result, rowOffset, newRow)
          // Dopo l'inserimento, tutti gli offset successivi sono spostati
          // di newRow.length. Ricalcoliamo l'AST per le operazioni successive.
        }

        // Ri-parsa dopo l'inserimento della riga
        const tree2 = parseMarkdown(result)

        // 2. Inserisci il blocco corpo dopo il separatore dell'indice
        const bodyOffset = findBodyInsertOffset(tree2)

        let body = `\n\n## ${id} — ${titolo}\n\n`
        body += `**Tipo**: ${parsed.tipo}\n`
        body += `**Stato**: open\n\n`
        body += `**Storia**\n\n`
        body += `${formatStoriaEntry(date, 'open', titolo, parsed.firma)}\n\n`
        body += `**Descrizione**\n\n`
        body += `${descrizione}\n\n`
        if (domande_aperte && domande_aperte.length > 0) {
          body += `**Domande aperte**\n\n`
          for (const d of domande_aperte) {
            body += `- [ ] ${d}\n`
          }
          body += `\n`
        }
        if (impatto && impatto.length > 0) {
          body += `**Impatto**\n\n`
          for (const imp of impatto) {
            body += `- ${imp.artefatto} — ${imp.descrizione}\n`
          }
          body += `\n`
        }
        if (parsed.collegate && parsed.collegate.length > 0) {
          body += `**Questioni collegate**: ${parsed.collegate.join(', ')}\n\n`
        }
        body += `---\n`

        result = insertAt(result, bodyOffset, body)

        // 3. Aggiorna contatore
        result = updateCounterInString(
          result,
          'Ultima questione inserita',
          `${id} — ${date}.`
        )

        return result
      })

      return {
        content: [{ type: 'text', text: `Questione ${createdId} creata.` }]
      }
    }
  })

  registerTool({
    name: 'update_stato',
    description:
      'Aggiorna lo stato di una questione: riga indice, campo Stato nel corpo e nuova riga in Storia.',
    schema: z.object({
      id: z.string(),
      nuovo_stato: z.string(),
      motivazione: z.string(),
      firma: z.string().optional()
    }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { id, nuovo_stato, motivazione: rawMotivazione, firma } = z.object({
        id: z.string(),
        nuovo_stato: z.string(),
        motivazione: z.string(),
        firma: z.string().optional()
      }).parse(params)
      validateEnum(nuovo_stato, VALID_STATES, 'nuovo_stato')
      validateStrings({ motivazione: rawMotivazione })

      const motivazione = await processText(rawMotivazione)

      await atomicFileOperation(questioniPath(), (content, tree) => {
        const date = today()
        let result = content

        // 1. Aggiorna riga indice: trova la riga con l'ID nella tabella
        const indexInfo = findIndexTable(tree)
        if (indexInfo) {
          const tableRow = findLineByPatternInRange(
            result,
            new RegExp(`\\|\\s*${id}\\s*\\|`),
            indexInfo.startOffset,
            indexInfo.endOffset
          )
          if (tableRow) {
            // Sostituisci lo stato nella riga (terza colonna)
            const fullLine = result.slice(tableRow.lineStart, tableRow.lineEnd)
            const endsWithNewline = fullLine.endsWith('\n')
            const line = endsWithNewline ? fullLine.slice(0, -1) : fullLine
            const updated = line.replace(
              /\|\s*([a-z-]+)\s*\|(\s*)$/,
              `| ${nuovo_stato} |$2`
            )
            result = replaceRange(
              result,
              tableRow.lineStart,
              tableRow.lineEnd,
              endsWithNewline ? updated + '\n' : updated
            )
          }
        }

        // Ri-parsa dopo modifica indice
        const tree2 = parseMarkdown(result)

        // 2. Trova il blocco della questione
        const block = findBlockByHeadingId(tree2, id)
        if (!block) throw new Error(`Questione ${id} non trovata.`)

        // 3. Aggiorna campo **Stato** nel corpo
        const statoLine = findLineByPatternInRange(
          result,
          /\*\*Stato\*\*:\s*[a-z-]+/,
          block.startOffset,
          block.endOffset
        )
        if (statoLine) {
          const oldText = result.slice(statoLine.lineStart, statoLine.lineEnd - 1)
          const newText = oldText.replace(
            /\*\*Stato\*\*:\s*[a-z-]+/,
            `**Stato**: ${nuovo_stato}`
          )
          result = replaceRange(result, statoLine.lineStart, statoLine.lineEnd - 1, newText)
        }

        // Ri-parsa per trovare la sezione Storia con offset corretti
        const tree3 = parseMarkdown(result)
        const block2 = findBlockByHeadingId(tree3, id)
        if (!block2) throw new Error(`Questione ${id} non trovata dopo aggiornamento stato.`)

        // 4. Aggiungi riga in Storia in prepend (la più recente in cima)
        const storiaLabel = findLineByPatternInRange(
          result,
          /\*\*Storia\*\*/,
          block2.startOffset,
          block2.endOffset
        )
        if (storiaLabel) {
          const firstEntry = findLineByPatternInRange(
            result,
            /^- \d{4}-\d{2}-\d{2}\s/,
            storiaLabel.lineEnd,
            block2.endOffset
          )
          const newEntry = formatStoriaEntry(date, nuovo_stato, motivazione, firma)
          if (firstEntry) {
            // Prepend: inserisci prima della prima riga della lista
            result = insertAt(result, firstEntry.lineStart, `${newEntry}\n`)
          } else {
            // Nessuna entry esistente, inserisci dopo il label Storia
            result = insertAt(result, storiaLabel.lineEnd, `\n${newEntry}\n`)
          }
        }

        // 5. Se closed, aggiorna contatore chiusura
        if (nuovo_stato === 'closed') {
          result = updateCounterInString(
            result,
            'Ultima questione chiusa',
            `${id} — ${date}.`
          )
        }

        return result
      })

      return {
        content: [{ type: 'text', text: `Stato di ${id} aggiornato a ${nuovo_stato}.` }]
      }
    }
  })

  registerTool({
    name: 'add_commento',
    description:
      'Aggiunge un commento (COMMENTO-NNN) in fondo al blocco questione, prima del separatore ---.',
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

      await atomicFileOperation(questioniPath(), (content, tree) => {
        const block = findBlockByHeadingId(tree, id)
        if (!block) throw new Error(`Questione ${id} non trovata.`)

        const date = today()

        // Conta commenti esistenti nel blocco
        const blockSlice = content.slice(block.startOffset, block.endOffset)
        const commentMatches = blockSlice.match(/COMMENTO-(\d+)/g) || []
        const maxComment = commentMatches.reduce((max, m) => {
          const n = parseInt(m.replace('COMMENTO-', ''), 10)
          return n > max ? n : max
        }, 0)
        const commentId = `COMMENTO-${padId(maxComment + 1)}`

        let result = content

        // Verifica se esiste la sezione Commenti nel blocco
        const commentiLabel = findLineByPatternInRange(
          result,
          /\*\*Commenti\*\*/,
          block.startOffset,
          block.endOffset
        )

        const commentBody = `\n${formatCommentoHeader(commentId, date, firma)}\n${testo}\n\n`

        if (commentiLabel) {
          // Inserisci prima del thematicBreak (alla fine del blocco)
          result = insertAt(result, block.endOffset, commentBody)
        } else {
          // Crea sezione Commenti e inserisci prima del thematicBreak
          const sectionBlock = `\n**Commenti**\n${commentBody}`
          result = insertAt(result, block.endOffset, sectionBlock)
        }

        return result
      })

      return {
        content: [{ type: 'text', text: `Commento aggiunto a ${id}.` }]
      }
    }
  })

  registerTool({
    name: 'add_domanda_aperta',
    description:
      'Aggiunge una domanda aperta (checkbox) alla sezione Domande aperte di una questione.',
    schema: z.object({
      id: z.string(),
      domanda: z.string()
    }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { id, domanda: rawDomanda } = z.object({
        id: z.string(),
        domanda: z.string()
      }).parse(params)
      validateStrings({ domanda: rawDomanda })

      const domanda = await processText(rawDomanda)

      await atomicFileOperation(questioniPath(), (content, tree) => {
        const block = findBlockByHeadingId(tree, id)
        if (!block) throw new Error(`Questione ${id} non trovata.`)

        let result = content

        // Cerca la sezione **Domande aperte** nel blocco
        const label = findLineByPatternInRange(
          result,
          /\*\*Domande aperte\*\*/,
          block.startOffset,
          block.endOffset
        )

        if (!label) throw new Error(`Sezione "Domande aperte" non trovata in ${id}.`)

        // Trova l'ultima checkbox nella lista sotto Domande aperte
        const lastItem = findLastLineByPatternInRange(
          result,
          /^- \[[ x]\] /,
          label.lineEnd,
          block.endOffset
        )

        const newItem = `- [ ] ${domanda}\n`

        if (lastItem) {
          result = insertAt(result, lastItem.lineEnd, newItem)
        } else {
          // Nessun item esistente: inserisci dopo il label (con riga vuota)
          result = insertAt(result, label.lineEnd, `\n${newItem}`)
        }

        return result
      })

      return {
        content: [{ type: 'text', text: `Domanda aperta aggiunta a ${id}.` }]
      }
    }
  })

  registerTool({
    name: 'add_impatto',
    description:
      'Aggiunge una voce alla sezione Impatto di una questione. Crea la sezione se non esiste.',
    schema: z.object({
      id: z.string(),
      artefatto: z.string(),
      descrizione: z.string()
    }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { id, artefatto, descrizione: rawDescrizione } = z.object({
        id: z.string(),
        artefatto: z.string(),
        descrizione: z.string()
      }).parse(params)
      validateStrings({ artefatto, descrizione: rawDescrizione })

      const descrizione = await processText(rawDescrizione)

      await atomicFileOperation(questioniPath(), (content, tree) => {
        const block = findBlockByHeadingId(tree, id)
        if (!block) throw new Error(`Questione ${id} non trovata.`)

        let result = content
        const newItem = `- ${artefatto} — ${descrizione}\n`

        // Cerca la sezione **Impatto** nel blocco
        const label = findLineByPatternInRange(
          result,
          /\*\*Impatto\*\*/,
          block.startOffset,
          block.endOffset
        )

        if (label) {
          // Trova l'ultima riga della lista sotto Impatto
          const lastItem = findLastLineByPatternInRange(
            result,
            /^- /,
            label.lineEnd,
            block.endOffset
          )

          if (lastItem) {
            result = insertAt(result, lastItem.lineEnd, newItem)
          } else {
            // Nessun item esistente: inserisci dopo il label
            result = insertAt(result, label.lineEnd, `\n${newItem}`)
          }
        } else {
          // Crea la sezione Impatto prima del thematicBreak
          const sectionBlock = `\n**Impatto**\n\n${newItem}`
          result = insertAt(result, block.endOffset, sectionBlock)
        }

        return result
      })

      return {
        content: [{ type: 'text', text: `Impatto aggiunto a ${id}.` }]
      }
    }
  })

  registerTool({
    name: 'add_collegate',
    description:
      'Aggiunge o aggiorna il campo Questioni collegate di una questione.',
    schema: z.object({
      id: z.string(),
      questione_ids: z.array(z.string())
    }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { id, questione_ids } = z.object({
        id: z.string(),
        questione_ids: z.array(z.string())
      }).parse(params)

      const qidPattern = /^QUESTIONE-\d+$/
      for (const qid of questione_ids) {
        if (!qidPattern.test(qid)) {
          return {
            content: [{
              type: 'text',
              text: `ID questione non valido: "${qid}". ` +
                'Atteso formato QUESTIONE-NNN.'
            }],
            isError: true
          }
        }
      }

      await atomicFileOperation(questioniPath(), (content, tree) => {
        const block = findBlockByHeadingId(tree, id)
        if (!block) throw new Error(`Questione ${id} non trovata.`)

        let result = content

        // Cerca campo **Questioni collegate** nel blocco
        const collegateLabel = findLineByPatternInRange(
          result,
          /\*\*Questioni collegate\*\*:\s*(.*)/,
          block.startOffset,
          block.endOffset
        )

        if (collegateLabel) {
          // Aggiorna: merge degli ID esistenti con i nuovi
          const existingIds = collegateLabel.match[1]
            .split(',')
            .map(s => s.trim())
            .filter(s => s !== '')
          const allIds = [...new Set([...existingIds, ...questione_ids])]
          const newLine = `**Questioni collegate**: ${allIds.join(', ')}`
          result = replaceRange(
            result,
            collegateLabel.lineStart,
            collegateLabel.lineEnd - 1,
            newLine
          )
        } else {
          // Inserisci tra Impatto e Commenti (o prima del thematicBreak)
          const commentiLabel = findLineByPatternInRange(
            result,
            /\*\*Commenti\*\*/,
            block.startOffset,
            block.endOffset
          )
          const insertOffset = commentiLabel
            ? commentiLabel.lineStart
            : block.endOffset
          const newLine = `**Questioni collegate**: ${questione_ids.join(', ')}\n\n`
          result = insertAt(result, insertOffset, newLine)
        }

        return result
      })

      return {
        content: [{ type: 'text', text: `Questioni collegate aggiornate per ${id}.` }]
      }
    }
  })

  registerTool({
    name: 'remove_questione',
    description:
      'Rimuove una questione dall\'indice e dal corpo di questioni.md ' +
      'senza creare entry nel mastro. Per la chiusura ordinaria usare ' +
      'sempre close_questione. Usare remove_questione solo per ' +
      'correzioni (es. questione aperta per errore).',
    schema: z.object({ id: z.string() }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { id } = z.object({ id: z.string() }).parse(params)

      await atomicFileOperation(questioniPath(), (content, tree) => {
        let result = content

        // 1. Rimuovi riga dall'indice
        const indexInfo = findIndexTable(tree)
        if (indexInfo) {
          const tableRow = findLineByPatternInRange(
            result,
            new RegExp(`\\|\\s*${id}\\s*\\|`),
            indexInfo.startOffset,
            indexInfo.endOffset
          )
          if (tableRow) {
            result = replaceRange(result, tableRow.lineStart, tableRow.lineEnd, '')
          }
        }

        // Ri-parsa dopo rimozione riga indice
        const tree2 = parseMarkdown(result)

        // 2. Rimuovi blocco corpo (heading h2 fino al thematicBreak incluso)
        const block = findBlockByHeadingId(tree2, id)
        if (block) {
          const breakInfo = findThematicBreakAfterBlock(result, block.endOffset)
          if (!breakInfo) {
            throw new Error(
              `Separatore --- non trovato dopo il blocco ${id}. ` +
              'Struttura del file non conforme.'
            )
          }
          result = replaceRange(result, block.startOffset, breakInfo.end, '')
        }

        return result
      })

      return {
        content: [{ type: 'text', text: `Questione ${id} rimossa.` }]
      }
    }
  })

  registerTool({
    name: 'check_item',
    description:
      'Spunta un checkbox [ ] -> [x] alla posizione indicata in una sezione ' +
      'di un file markdown. Indice 1-based. Se la sezione compare più volte ' +
      'nel file, il parametro id è obbligatorio per identificare il blocco ' +
      'contenitore.',
    schema: z.object({
      path: z.string(),
      sezione: z.string(),
      indice: z.number().int().min(1),
      nota: z.string().optional(),
      id: z.string().optional()
    }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { path: filePath, sezione, indice, nota: rawNota, id } = z.object({
        path: z.string(),
        sezione: z.string(),
        indice: z.number().int().min(1),
        nota: z.string().optional(),
        id: z.string().optional()
      }).parse(params)

      const nota = rawNota ? await processText(rawNota) : undefined

      const fullPath = resolveOperaPath(filePath)

      await atomicFileOperation(fullPath, (content, tree) => {
        let result = content
        const { searchStart, searchEnd } = resolveSectionRange(
          content, tree, sezione, id
        )

        // Trova tutte le righe checkbox nel range
        let count = 0
        const slice = result.slice(searchStart, searchEnd)
        const lines = slice.split('\n')
        let offset = searchStart
        for (const line of lines) {
          const m = line.match(/^- \[[ x]\] /)
          if (m) {
            count++
            if (count === indice) {
              const checkboxMatch = line.match(/^- \[ \] /)
              if (!checkboxMatch) {
                return result
              }
              const lineStart = offset
              const lineEnd = offset + line.length
              let newLine = line.replace('- [ ] ', '- [x] ')
              if (nota) {
                newLine += ` — ${nota}`
              }
              result = replaceRange(result, lineStart, lineEnd, newLine)
              return result
            }
          } else if (line.trim() !== '' && !line.match(/^- /)) {
            break
          }
          offset += line.length + 1
        }

        throw new Error(`Indice ${indice} fuori range (${count} elementi).`)
      })

      return {
        content: [{ type: 'text', text: `Elemento ${indice} spuntato nella sezione "${sezione}".` }]
      }
    }
  })

  registerTool({
    name: 'annotate_item',
    description:
      'Aggiunge un\'annotazione inline a un elemento di una lista senza ' +
      'spuntarlo. Se la sezione compare più volte nel file, il parametro ' +
      'id è obbligatorio per identificare il blocco contenitore.',
    schema: z.object({
      path: z.string(),
      sezione: z.string(),
      indice: z.number().int().min(1),
      nota: z.string(),
      id: z.string().optional()
    }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { path: filePath, sezione, indice, nota: rawNota, id } = z.object({
        path: z.string(),
        sezione: z.string(),
        indice: z.number().int().min(1),
        nota: z.string(),
        id: z.string().optional()
      }).parse(params)
      validateStrings({ nota: rawNota })

      const nota = await processText(rawNota)

      const fullPath = resolveOperaPath(filePath)

      await atomicFileOperation(fullPath, (content, tree) => {
        let result = content
        const { searchStart, searchEnd } = resolveSectionRange(
          content, tree, sezione, id
        )

        // Trova la riga alla posizione indice nel range
        let count = 0
        const slice = result.slice(searchStart, searchEnd)
        const lines = slice.split('\n')
        let offset = searchStart
        for (const line of lines) {
          const m = line.match(/^- /)
          if (m) {
            count++
            if (count === indice) {
              const lineStart = offset
              const lineEnd = offset + line.length
              const newLine = `${line} — ${nota}`
              result = replaceRange(result, lineStart, lineEnd, newLine)
              return result
            }
          } else if (line.trim() !== '' && !line.startsWith('  ')) {
            break
          }
          offset += line.length + 1
        }

        throw new Error(`Indice ${indice} fuori range (${count} elementi).`)
      })

      return {
        content: [{ type: 'text', text: `Annotazione aggiunta all'elemento ${indice} nella sezione "${sezione}".` }]
      }
    }
  })
}
