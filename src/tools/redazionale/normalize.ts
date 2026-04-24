import { readFile, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { pandocNormalize } from '../../enrichments/redazionale/transforms/pandoc.js'
import { getDirectives } from '../../enrichments/redazionale/index.js'

const normalizeSchema = z.object({
  path: z.string().describe('Path del file da normalizzare')
})

export function registerNormalizeTools(): void {
  registerTool({
    name: 'normalize_file',
    description:
      'Normalizza un file markdown con Pandoc commonmark_x. ' +
      'ATTENZIONE: questa operazione riprocessa l\'intero file e ' +
      'altera il diff git. Usare solo su richiesta esplicita.',
    schema: normalizeSchema,
    category: 'conditional',
    requiredEnrichments: ['redazionale'],
    handler: async (params: unknown): Promise<ToolResult> => {
      const parsed = normalizeSchema.parse(params)

      const directives = getDirectives()
      const columns = (directives?.direttive['wrap-colonne']?.valore as number) || 80

      let content: string
      try {
        content = await readFile(parsed.path, 'utf-8')
      } catch {
        return {
          content: [{ type: 'text', text: `File non trovato: ${parsed.path}` }],
          isError: true
        }
      }

      const originalLines = content.split('\n').length
      const normalized = await pandocNormalize(content, columns)
      await writeFile(parsed.path, normalized, 'utf-8')
      const newLines = normalized.split('\n').length

      console.warn(
        `normalize_file: ${parsed.path} — ` +
        `questa operazione altera il diff git`
      )

      return {
        content: [{ type: 'text', text: JSON.stringify({
          file: parsed.path,
          righe_originali: originalLines,
          righe_normalizzate: newLines,
          avviso: 'Il file e\' stato normalizzato con Pandoc commonmark_x. ' +
            'Il diff git includera\' riformattazioni di testo non modificato logicamente.'
        }, null, 2) }]
      }
    }
  })
}
