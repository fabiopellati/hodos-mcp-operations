import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { readRaw } from '../../operations/atomic.js'
import { validateStrings } from '../../operations/validate.js'
import { rfcDir } from '../../config/paths.js'

export const readRfcSchema = z.object({
  questione_id: z.string()
})

/**
 * Cerca nella directory rfc/ i file che corrispondono all'ID questione.
 * Supporta pattern flessibili: rfc-Q{NNN}-*.md, rfc-QUESTIONE-{NNN}-*.md, ecc.
 */
export async function findRfcFile(questioneId: string): Promise<string> {
  const dir = rfcDir()
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    throw new Error(
      `Directory rfc/ non trovata in ${dir}`
    )
  }

  // Normalizza l'ID per la ricerca (case-insensitive)
  const idLower = questioneId.toLowerCase()
  // Estrai il numero per supportare il formato abbreviato (rfc-Q002-*.md)
  const numMatch = questioneId.match(/(\d+)/)
  const qAbbr = numMatch ? `q${numMatch[1]}` : null

  const matching = files.filter(f => {
    const fLower = f.toLowerCase()
    if (!fLower.endsWith('.md')) return false
    // Match formato completo (rfc-questione-002.md)
    if (fLower.includes(idLower)) return true
    // Match formato abbreviato (rfc-q002-*.md)
    if (qAbbr && fLower.startsWith(`rfc-${qAbbr}`)) return true
    return false
  })

  if (matching.length === 0) {
    throw new Error(
      `Nessun file RFC trovato per la questione "${questioneId}"`
    )
  }

  if (matching.length > 1) {
    throw new Error(
      `Trovati ${matching.length} file RFC per la questione "${questioneId}": ` +
      `${matching.join(', ')}. Atteso un solo file per ID.`
    )
  }

  return join(dir, matching[0])
}

async function handleReadRfc(params: unknown): Promise<ToolResult> {
  const { questione_id } = readRfcSchema.parse(params)
  validateStrings({ questione_id })

  try {
    const filePath = await findRfcFile(questione_id)
    const content = await readRaw(filePath)
    return {
      content: [{ type: 'text', text: content }]
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: (err as Error).message }],
      isError: true
    }
  }
}

export function registerReadRfc(): void {
  registerTool({
    name: 'read_rfc',
    description:
      'Legge il contenuto di un file RFC associato a una questione. ' +
      'Cerca nella directory rfc/ un file il cui nome contenga l\'ID questione.',
    schema: readRfcSchema,
    category: 'base',
    requiredEnrichments: [],
    handler: handleReadRfc
  })
}
