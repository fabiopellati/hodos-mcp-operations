import path from 'node:path'
import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { atomicFileOperation, readAndParse } from '../../operations/atomic.js'
import { parseMarkdown, stringifyMarkdown } from '../../parser/markdown.js'
import {
  findIndexTable,
  findInsertionPointAfterIndex,
  getHeadingText
} from '../../parser/sections.js'
import { validateStrings, validateEnum, VALID_STATES } from '../../operations/validate.js'
import { formatStoriaEntry, formatCommentoHeader } from '../../enrichments/firma.js'
import { findQuestioneBlock } from './read.js'
import type { Root, TableRow, TableCell, Text, Paragraph, Blockquote } from 'mdast'
import { toString } from 'mdast-util-to-string'

const VALID_TYPES = ['rilievo', 'revisione', 'anomalia'] as const

const basePath = process.env.OPERA_BASE_PATH || '/opera'
const questioniPath = () => path.join(basePath, 'questioni.md')

const today = () => new Date().toISOString().slice(0, 10)

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

/**
 * Legge il contatore "Ultima questione inserita" dal blockquote e ne estrae il numero.
 * Restituisce 0 se il contatore indica "—".
 */
function readCounter(tree: Root, label: string): number {
  for (const node of tree.children) {
    if (node.type !== 'blockquote') continue
    const text = toString(node)
    if (!text.includes(label)) continue

    const match = text.match(new RegExp(`${label}:\\s*(?:QUESTIONE-(\\d+))`))
    if (match) return parseInt(match[1], 10)
    return 0
  }
  return 0
}

/**
 * Aggiorna un contatore blockquote nel documento.
 */
function updateCounter(tree: Root, label: string, value: string): void {
  for (const node of tree.children) {
    if (node.type !== 'blockquote') continue
    const text = toString(node)
    if (!text.includes(label)) continue

    // Ricostruisce il contenuto del blockquote
    const paragraph = node.children[0]
    if (paragraph && paragraph.type === 'paragraph') {
      paragraph.children = [{ type: 'text', value: `${label}: ${value}` } as Text]
    }
    return
  }
}

function padId(num: number): string {
  return String(num).padStart(3, '0')
}

/**
 * Trova la posizione di inserimento del blocco corpo:
 * subito dopo il blockquote dei contatori, prima della prima questione esistente.
 * Il flusso del documento è: titolo → heading Indice → tabella indice → blockquote → corpo questioni.
 * Le nuove questioni vanno inserite subito dopo il blockquote (prepend-only).
 */
function findBodyInsertionPoint(tree: Root): number {
  // Cerca il blockquote dei contatori e inserisce subito dopo
  for (let i = 0; i < tree.children.length; i++) {
    if (tree.children[i].type === 'blockquote') {
      return i + 1
    }
  }
  // Fallback: dopo la tabella indice
  const insertionAfterIndex = findInsertionPointAfterIndex(tree)
  return insertionAfterIndex
}

/**
 * Cerca la sezione per label dentro un blocco questione, restituendo
 * l'indice relativo all'interno del blocco.
 * Restituisce l'ULTIMA occorrenza trovata per gestire il caso in cui
 * remark abbia generato duplicati durante round-trip precedenti.
 */
function findSectionInBlock(
  children: Root['children'],
  startIndex: number,
  endIndex: number,
  label: string
): number | null {
  let lastFound: number | null = null
  for (let i = startIndex; i < endIndex; i++) {
    const node = children[i]
    if (node.type === 'paragraph') {
      const text = toString(node)
      if (text.startsWith(`**${label}**`)) lastFound = i
    }
  }
  return lastFound
}

/**
 * Conta i commenti esistenti in un blocco.
 */
function countComments(
  children: Root['children'],
  startIndex: number,
  endIndex: number
): number {
  let count = 0
  for (let i = startIndex; i < endIndex; i++) {
    const text = toString(children[i])
    const matches = text.match(/COMMENTO-\d+/g)
    if (matches) count = Math.max(count, ...matches.map(m => parseInt(m.replace('COMMENTO-', ''), 10)))
  }
  return count
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

      await atomicFileOperation(questioniPath(), (tree) => {
        const lastNum = readCounter(tree, 'Ultima questione inserita')
        const nextNum = lastNum + 1
        const id = `QUESTIONE-${padId(nextNum)}`
        const date = today()

        // Inserisci riga nell'indice (in cima, dopo l'header)
        const indexResult = findIndexTable(tree)
        if (indexResult) {
          const { table } = indexResult
          const newRow = makeTableRow([id, parsed.titolo, 'open'])
          // Inserisce dopo l'header (riga 0)
          table.children.splice(1, 0, newRow)
        }

        // Costruisci il blocco corpo come markdown e parsalo
        let body = `## ${id} — ${parsed.titolo}\n\n`
        body += `**Tipo**: ${parsed.tipo}\n`
        body += `**Stato**: open\n\n`
        body += `**Storia**\n`
        body += `${formatStoriaEntry(date, 'open', parsed.titolo, parsed.firma)}\n\n`
        body += `**Descrizione**\n\n`
        body += `${parsed.descrizione}\n\n`
        body += `**Domande aperte**\n`
        if (parsed.domande_aperte && parsed.domande_aperte.length > 0) {
          for (const d of parsed.domande_aperte) {
            body += `- [ ] ${d}\n`
          }
        }
        body += `\n`
        body += `**Impatto**\n`
        if (parsed.impatto && parsed.impatto.length > 0) {
          for (const imp of parsed.impatto) {
            body += `- ${imp.artefatto} — ${imp.descrizione}\n`
          }
        }
        body += `\n`
        if (parsed.collegate && parsed.collegate.length > 0) {
          body += `**Questioni collegate**: ${parsed.collegate.join(', ')}\n\n`
        }

        const bodyTree = parseMarkdown(body)
        const insertPoint = findBodyInsertionPoint(tree)
        tree.children.splice(insertPoint, 0, ...bodyTree.children, { type: 'thematicBreak' })

        // Aggiorna contatore
        updateCounter(tree, 'Ultima questione inserita', `${id} — ${date}.`)

        return tree
      })

      return {
        content: [{ type: 'text', text: `Questione creata.` }]
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
      const { id, nuovo_stato, motivazione, firma } = z.object({
        id: z.string(),
        nuovo_stato: z.string(),
        motivazione: z.string(),
        firma: z.string().optional()
      }).parse(params)
      validateEnum(nuovo_stato, VALID_STATES, 'nuovo_stato')
      validateStrings({ motivazione })

      await atomicFileOperation(questioniPath(), (tree) => {
        const date = today()

        // 1. Aggiorna riga indice
        const indexResult = findIndexTable(tree)
        if (indexResult) {
          const { table } = indexResult
          for (let r = 1; r < table.children.length; r++) {
            const row = table.children[r]
            const cellId = toString(row.children[0])
            if (cellId.trim() === id) {
              row.children[2] = makeTextCell(nuovo_stato)
              break
            }
          }
        }

        // 2. Aggiorna campo Stato e aggiunge riga in Storia nel corpo
        const block = findQuestioneBlock(tree, id)
        if (!block) throw new Error(`Questione ${id} non trovata.`)

        for (let i = block.startIndex; i < block.endIndex; i++) {
          const node = tree.children[i]
          if (node.type !== 'paragraph') continue
          const text = toString(node)

          // Aggiorna **Stato** — potrebbe trovarsi in un paragrafo multi-riga
          // insieme a **Tipo**, quindi cerchiamo la sottostringa
          if (text.includes('**Stato**') || text.includes('Stato')) {
            const fullMd = stringifyMarkdown({ type: 'root', children: [node] })
            const replaced = fullMd.replace(
              /\*\*Stato\*\*:\s*[a-z-]+/,
              `**Stato**: ${nuovo_stato}`
            )
            if (replaced !== fullMd) {
              const reparsed = parseMarkdown(replaced.trim()).children[0]
              if (reparsed) {
                tree.children[i] = reparsed
              }
            }
          }

          // Aggiunge riga in **Storia**
          if (text.includes('**Storia**') || text.includes('Storia')) {
            // La lista segue questo paragrafo
            const listNode = tree.children[i + 1]
            if (listNode && listNode.type === 'list') {
              const newItemText = formatStoriaEntry(date, nuovo_stato, motivazione, firma)
              const newItem = parseMarkdown(newItemText).children[0]
              if (newItem && newItem.type === 'list') {
                listNode.children.push(...newItem.children)
              }
            }
          }
        }

        // 3. Se closed, aggiorna contatore chiusura
        if (nuovo_stato === 'closed') {
          updateCounter(tree, 'Ultima questione chiusa', `${id} — ${date}.`)
        }

        return tree
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
      const { id, testo, firma } = z.object({
        id: z.string(),
        testo: z.string(),
        firma: z.string().optional()
      }).parse(params)
      validateStrings({ testo })

      await atomicFileOperation(questioniPath(), (tree) => {
        const block = findQuestioneBlock(tree, id)
        if (!block) throw new Error(`Questione ${id} non trovata.`)

        const date = today()
        const lastComment = countComments(tree.children, block.startIndex, block.endIndex)
        const commentId = `COMMENTO-${padId(lastComment + 1)}`

        // Verifica se esiste già la sezione Commenti
        const commentiIdx = findSectionInBlock(tree.children, block.startIndex, block.endIndex, 'Commenti')

        const commentBody = `${formatCommentoHeader(commentId, date, firma)}\n${testo}`
        const commentNodes = parseMarkdown(commentBody).children

        if (commentiIdx !== null) {
          // Inserisce prima della fine del blocco (prima del thematicBreak)
          tree.children.splice(block.endIndex, 0, ...commentNodes)
        } else {
          // Crea sezione Commenti e inserisce prima del thematicBreak
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
      const { id, domanda } = z.object({
        id: z.string(),
        domanda: z.string()
      }).parse(params)
      validateStrings({ domanda })

      await atomicFileOperation(questioniPath(), (tree) => {
        const block = findQuestioneBlock(tree, id)
        if (!block) throw new Error(`Questione ${id} non trovata.`)

        // Trova la sezione Domande aperte e la lista che la segue
        for (let i = block.startIndex; i < block.endIndex; i++) {
          const node = tree.children[i]
          if (node.type !== 'paragraph') continue
          if (!toString(node).startsWith('**Domande aperte**')) continue

          const listNode = tree.children[i + 1]
          const newItemMd = `- [ ] ${domanda}`
          const parsed = parseMarkdown(newItemMd).children[0]

          if (listNode && listNode.type === 'list' && parsed && parsed.type === 'list') {
            listNode.children.push(...parsed.children)
          } else if (parsed && parsed.type === 'list') {
            // Non c'è ancora una lista, la inseriamo dopo il paragrafo
            tree.children.splice(i + 1, 0, parsed)
          }
          break
        }

        return tree
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
      const { id, artefatto, descrizione } = z.object({
        id: z.string(),
        artefatto: z.string(),
        descrizione: z.string()
      }).parse(params)
      validateStrings({ artefatto, descrizione })

      await atomicFileOperation(questioniPath(), (tree) => {
        const block = findQuestioneBlock(tree, id)
        if (!block) throw new Error(`Questione ${id} non trovata.`)

        const newItemMd = `- ${artefatto} — ${descrizione}`

        // Cerca la sezione Impatto
        const impattoIdx = findSectionInBlock(tree.children, block.startIndex, block.endIndex, 'Impatto')

        if (impattoIdx !== null) {
          const parsed = parseMarkdown(newItemMd).children[0]

          // Cerca una lista nei nodi successivi al paragrafo Impatto,
          // fermandosi al prossimo paragrafo bold o thematicBreak
          let listIdx: number | null = null
          for (let i = impattoIdx + 1; i < block.endIndex; i++) {
            const n = tree.children[i]
            if (n.type === 'list') {
              listIdx = i
              break
            }
            if (n.type === 'thematicBreak') break
            if (n.type === 'paragraph' && toString(n).match(/^\*\*.+\*\*/)) break
          }

          const existingList = listIdx !== null ? tree.children[listIdx] : null
          if (existingList && existingList.type === 'list' && parsed && parsed.type === 'list') {
            existingList.children.push(...parsed.children)
          } else if (parsed && parsed.type === 'list') {
            tree.children.splice(impattoIdx + 1, 0, parsed)
          }
        } else {
          // Crea la sezione Impatto prima della fine del blocco
          const sectionMd = `**Impatto**\n${newItemMd}`
          const sectionNodes = parseMarkdown(sectionMd).children
          tree.children.splice(block.endIndex, 0, ...sectionNodes)
        }

        return tree
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

      await atomicFileOperation(questioniPath(), (tree) => {
        const block = findQuestioneBlock(tree, id)
        if (!block) throw new Error(`Questione ${id} non trovata.`)

        // Cerca campo Questioni collegate esistente
        const collegateIdx = findSectionInBlock(
          tree.children, block.startIndex, block.endIndex, 'Questioni collegate'
        )

        const newValue = `**Questioni collegate**: ${questione_ids.join(', ')}`

        if (collegateIdx !== null) {
          // Aggiorna il campo esistente: aggiungi i nuovi ID
          const existing = toString(tree.children[collegateIdx])
          const match = existing.match(/\*\*Questioni collegate\*\*:\s*(.+)/)
          const existingIds = match ? match[1].split(',').map(s => s.trim()) : []
          const allIds = [...new Set([...existingIds, ...questione_ids])]
          tree.children[collegateIdx] = parseMarkdown(
            `**Questioni collegate**: ${allIds.join(', ')}`
          ).children[0]
        } else {
          // Inserisci prima della fine del blocco
          const node = parseMarkdown(newValue).children[0]
          tree.children.splice(block.endIndex, 0, node)
        }

        return tree
      })

      return {
        content: [{ type: 'text', text: `Questioni collegate aggiornate per ${id}.` }]
      }
    }
  })

  registerTool({
    name: 'remove_questione',
    description:
      'Rimuove una questione dall\'indice e dal corpo di questioni.md.',
    schema: z.object({ id: z.string() }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { id } = z.object({ id: z.string() }).parse(params)

      await atomicFileOperation(questioniPath(), (tree) => {
        // Rimuovi riga dall'indice
        const indexResult = findIndexTable(tree)
        if (indexResult) {
          const { table } = indexResult
          const rowIdx = table.children.findIndex(
            (row, i) => i > 0 && toString(row.children[0]).trim() === id
          )
          if (rowIdx > 0) {
            table.children.splice(rowIdx, 1)
          }
        }

        // Rimuovi blocco corpo (heading h2 fino al thematicBreak incluso)
        const block = findQuestioneBlock(tree, id)
        if (block) {
          // Includi anche il thematicBreak finale
          const endWithBreak = block.endIndex < tree.children.length &&
            tree.children[block.endIndex].type === 'thematicBreak'
            ? block.endIndex + 1
            : block.endIndex
          tree.children.splice(block.startIndex, endWithBreak - block.startIndex)
        }

        return tree
      })

      return {
        content: [{ type: 'text', text: `Questione ${id} rimossa.` }]
      }
    }
  })

  registerTool({
    name: 'check_item',
    description:
      'Spunta un checkbox [ ] -> [x] alla posizione indicata in una sezione di un file markdown. Indice 1-based.',
    schema: z.object({
      path: z.string(),
      sezione: z.string(),
      indice: z.number().int().min(1),
      nota: z.string().optional()
    }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { path: filePath, sezione, indice, nota } = z.object({
        path: z.string(),
        sezione: z.string(),
        indice: z.number().int().min(1),
        nota: z.string().optional()
      }).parse(params)

      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(basePath, filePath)

      await atomicFileOperation(fullPath, (tree) => {
        // Trova la sezione
        let sectionStart = -1
        for (let i = 0; i < tree.children.length; i++) {
          const node = tree.children[i]
          if (node.type === 'paragraph' && toString(node).startsWith(`**${sezione}**`)) {
            sectionStart = i
            break
          }
        }
        if (sectionStart === -1) throw new Error(`Sezione "${sezione}" non trovata.`)

        // Cerca la lista che segue
        const listNode = tree.children[sectionStart + 1]
        if (!listNode || listNode.type !== 'list') {
          throw new Error(`Nessuna lista trovata nella sezione "${sezione}".`)
        }

        const itemIdx = indice - 1
        if (itemIdx >= listNode.children.length) {
          throw new Error(`Indice ${indice} fuori range (${listNode.children.length} elementi).`)
        }

        const item = listNode.children[itemIdx]
        if (item.checked === false) {
          item.checked = true
          if (nota) {
            const itemText = toString(item)
            const textNode = item.children[0]
            if (textNode && textNode.type === 'paragraph') {
              textNode.children.push(
                { type: 'text', value: ` — ${nota}` } as Text
              )
            }
          }
        }

        return tree
      })

      return {
        content: [{ type: 'text', text: `Elemento ${indice} spuntato nella sezione "${sezione}".` }]
      }
    }
  })

  registerTool({
    name: 'annotate_item',
    description:
      'Aggiunge un\'annotazione inline a un elemento di una lista senza spuntarlo.',
    schema: z.object({
      path: z.string(),
      sezione: z.string(),
      indice: z.number().int().min(1),
      nota: z.string()
    }),
    category: 'base',
    requiredEnrichments: [],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { path: filePath, sezione, indice, nota } = z.object({
        path: z.string(),
        sezione: z.string(),
        indice: z.number().int().min(1),
        nota: z.string()
      }).parse(params)
      validateStrings({ nota })

      const fullPath = path.isAbsolute(filePath)
        ? filePath
        : path.join(basePath, filePath)

      await atomicFileOperation(fullPath, (tree) => {
        let sectionStart = -1
        for (let i = 0; i < tree.children.length; i++) {
          const node = tree.children[i]
          if (node.type === 'paragraph' && toString(node).startsWith(`**${sezione}**`)) {
            sectionStart = i
            break
          }
        }
        if (sectionStart === -1) throw new Error(`Sezione "${sezione}" non trovata.`)

        const listNode = tree.children[sectionStart + 1]
        if (!listNode || listNode.type !== 'list') {
          throw new Error(`Nessuna lista trovata nella sezione "${sezione}".`)
        }

        const itemIdx = indice - 1
        if (itemIdx >= listNode.children.length) {
          throw new Error(`Indice ${indice} fuori range (${listNode.children.length} elementi).`)
        }

        const item = listNode.children[itemIdx]
        const textNode = item.children[0]
        if (textNode && textNode.type === 'paragraph') {
          textNode.children.push(
            { type: 'text', value: ` — ${nota}` } as Text
          )
        }

        return tree
      })

      return {
        content: [{ type: 'text', text: `Annotazione aggiunta all'elemento ${indice} nella sezione "${sezione}".` }]
      }
    }
  })
}
