import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { readAndParse } from '../../operations/atomic.js'
import { getHeadingText } from '../../parser/sections.js'
import { validateStrings, validateEnum } from '../../operations/validate.js'
import { findVoceByBlId } from './read.js'
import type { Heading } from 'mdast'

const basePath = process.env.OPERA_BASE_PATH || '/opera'

const VALID_CONFORMITA = ['conforme', 'parziale', 'non conforme'] as const
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/

function attivitaPath(unita: string): string {
  return path.join(basePath, 'documenti', 'unita', unita, 'attivita.md')
}

/** Conta le voci BL-N esistenti per determinare il prossimo numero */
function contaVoci(content: string): number {
  const matches = content.match(/^## BL-\d+/gm)
  return matches ? matches.length : 0
}

export function registerAttivitaWriteTools(): void {
  registerTool({
    name: 'create_voce_attivita',
    description:
      'Crea una nuova voce di attività BL-N nell\'unità specificata. ' +
      'Il numero viene assegnato automaticamente in sequenza.',
    schema: z.object({
      unita: z.string(),
      titolo: z.string(),
      richiesta: z.string(),
      criteri: z.string(),
      note: z.string().optional()
    }),
    category: 'conditional',
    requiredEnrichments: ['fasi-p0-p4'],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { unita, titolo, richiesta, criteri, note } = z.object({
        unita: z.string(),
        titolo: z.string(),
        richiesta: z.string(),
        criteri: z.string(),
        note: z.string().optional()
      }).parse(params)

      validateStrings({ unita, titolo, richiesta, criteri })
      if (note) validateStrings({ note })

      const filePath = attivitaPath(unita)
      const content = await readFile(filePath, 'utf-8')
      const nextNum = contaVoci(content) + 1

      let block = `\n## BL-${nextNum} — ${titolo}\n`
      block += `\n### Richiesta\n\n${richiesta}\n`
      block += `\n### Criteri di verifica\n\n${criteri}\n`
      if (note) {
        block += `\n### Note\n\n${note}\n`
      }

      await writeFile(filePath, content + block, 'utf-8')

      return {
        content: [{
          type: 'text',
          text: `Voce BL-${nextNum} — ${titolo} creata nell'unità "${unita}".`
        }]
      }
    }
  })

  registerTool({
    name: 'close_voce_attivita',
    description:
      'Chiude una voce di attività BL-N aggiungendo la sezione Consegna. ' +
      'La voce non deve essere già chiusa.',
    schema: z.object({
      unita: z.string(),
      bl_id: z.number(),
      data: z.string(),
      conformita: z.string(),
      descrizione: z.string()
    }),
    category: 'conditional',
    requiredEnrichments: ['fasi-p0-p4'],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { unita, bl_id, data, conformita, descrizione } = z.object({
        unita: z.string(),
        bl_id: z.number(),
        data: z.string(),
        conformita: z.string(),
        descrizione: z.string()
      }).parse(params)

      validateStrings({ unita, data, conformita, descrizione })
      validateEnum(conformita, VALID_CONFORMITA, 'conformita')

      if (!DATA_REGEX.test(data)) {
        throw new Error(
          `Formato data non valido: "${data}". Usa il formato YYYY-MM-DD.`
        )
      }

      const filePath = attivitaPath(unita)
      const tree = await readAndParse(filePath)
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

      // Verifica che non sia già chiusa
      for (let i = block.startIndex; i < block.endIndex; i++) {
        const node = tree.children[i]
        if (node.type === 'heading' && node.depth === 3) {
          if (getHeadingText(node).startsWith('Consegna')) {
            return {
              content: [{
                type: 'text',
                text: `La voce BL-${bl_id} è già chiusa.`
              }],
              isError: true
            }
          }
        }
      }

      // Inserisce la sezione Consegna operando sul testo raw per
      // evitare riformattazioni indesiderate del parser
      const content = await readFile(filePath, 'utf-8')
      const lines = content.split('\n')

      // Trova la riga di inserimento: prima del prossimo heading h2 o fine file
      // Cerchiamo l'heading h2 successivo partendo dalla posizione nel file
      const voceHeading = tree.children[block.startIndex]
      const startLine = voceHeading.position?.start.line ?? 1

      let insertLine = lines.length
      // Cerca il prossimo heading h2 dopo la voce corrente
      if (block.endIndex < tree.children.length) {
        const nextNode = tree.children[block.endIndex]
        if (nextNode.position) {
          insertLine = nextNode.position.start.line - 1
        }
      }

      const consegna =
        `\n### Consegna [${data}]\n\n` +
        `**Conformità**: ${conformita}\n\n` +
        `${descrizione}\n`

      lines.splice(insertLine, 0, consegna)
      await writeFile(filePath, lines.join('\n'), 'utf-8')

      return {
        content: [{
          type: 'text',
          text: `Voce BL-${bl_id} chiusa con conformità "${conformita}".`
        }]
      }
    }
  })
}
