import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { readRaw, insertAt } from '../../operations/atomic.js'
import { parseMarkdown } from '../../parser/markdown.js'
import { getHeadingText } from '../../parser/sections.js'
import { validateStrings, validateEnum } from '../../operations/validate.js'
import { documentiDir } from '../../config/paths.js'
import { findVoceByBlId } from './read.js'

const VALID_CONFORMITA = ['conforme', 'parziale', 'non conforme'] as const
const DATA_REGEX = /^\d{4}-\d{2}-\d{2}$/

function attivitaPath(unita: string): string {
  return join(documentiDir, 'unita', unita, 'attivita.md')
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
      const content = await readRaw(filePath)
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
      bl_id: z.string(),
      data: z.string(),
      conformita: z.string(),
      descrizione: z.string()
    }),
    category: 'conditional',
    requiredEnrichments: ['fasi-p0-p4'],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { unita, bl_id, data, conformita, descrizione } = z.object({
        unita: z.string(),
        bl_id: z.string(),
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

      const filePath = attivitaPath(unita)
      const content = await readRaw(filePath)
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

      // Verifica che non sia già chiusa cercando "### Consegna" nel range
      const voceSlice = content.slice(block.startOffset, block.endOffset)
      if (/^### Consegna/m.test(voceSlice)) {
        return {
          content: [{
            type: 'text',
            text: `La voce ${bl_id} è già chiusa.`
          }],
          isError: true
        }
      }

      // Inserisci la sezione Consegna prima della fine del blocco
      // (prima del prossimo heading h2 o fine file)
      const consegna =
        `\n### Consegna [${data}]\n\n` +
        `**Conformità**: ${conformita}\n\n` +
        `${descrizione}\n`

      const modified = insertAt(content, block.endOffset, consegna)
      await writeFile(filePath, modified, 'utf-8')

      return {
        content: [{
          type: 'text',
          text: `Voce ${bl_id} chiusa con conformità "${conformita}".`
        }]
      }
    }
  })
}
