import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { readRaw } from '../../operations/atomic.js'
import { validateStrings } from '../../operations/validate.js'

const basePath = process.env.OPERA_BASE_PATH || '/opera'
const rfcDir = join(basePath, 'rfc')

export const readRfcSchema = z.object({
  questione_id: z.string()
})

/**
 * Cerca nella directory rfc/ i file che corrispondono all'ID questione.
 * Supporta pattern flessibili: rfc-Q{NNN}-*.md, rfc-QUESTIONE-{NNN}-*.md, ecc.
 */
export async function findRfcFile(questioneId: string): Promise<string> {
  let files: string[]
  try {
    files = await readdir(rfcDir)
  } catch {
    throw new Error(
      `Directory rfc/ non trovata in ${basePath}`
    )
  }

  // Normalizza l'ID per la ricerca (case-insensitive)
  const idLower = questioneId.toLowerCase()
  const matching = files.filter(f => {
    const fLower = f.toLowerCase()
    return fLower.endsWith('.md') && fLower.includes(idLower)
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

  return join(rfcDir, matching[0])
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
