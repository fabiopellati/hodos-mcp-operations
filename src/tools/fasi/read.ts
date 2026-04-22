import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { readAndParse } from '../../operations/atomic.js'
import { stringifyMarkdown } from '../../parser/markdown.js'
import { findSectionByHeading, getHeadingText } from '../../parser/sections.js'
import { validateStrings } from '../../operations/validate.js'
import type { Root, Heading } from 'mdast'

const basePath = process.env.OPERA_BASE_PATH || '/opera'

function resolveDocPath(relativePath: string): string {
  const normalized = path.normalize(relativePath)
  if (!normalized.startsWith('documenti/') && !normalized.startsWith('documenti\\')) {
    throw new Error(
      `Il path deve essere sotto "documenti/". Ricevuto: ${relativePath}`
    )
  }
  // Protezione da path traversal
  const full = path.resolve(basePath, normalized)
  if (!full.startsWith(path.join(basePath, 'documenti'))) {
    throw new Error(`Path non valido: ${relativePath}`)
  }
  return full
}

function listHeadings(tree: Root): string[] {
  return tree.children
    .filter((n): n is Heading => n.type === 'heading')
    .map(h => `${'#'.repeat(h.depth)} ${getHeadingText(h)}`)
}

export function registerFasiReadTools(): void {
  registerTool({
    name: 'read_documento',
    description:
      'Legge un documento di fase dato il path relativo ' +
      '(es. "documenti/definizione/1-obiettivi.md"). ' +
      'Restituisce il contenuto intero.',
    schema: z.object({ path: z.string() }),
    category: 'conditional',
    requiredEnrichments: ['fasi-p0-p4'],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { path: relPath } = z.object({ path: z.string() }).parse(params)
      validateStrings({ path: relPath })

      const filePath = resolveDocPath(relPath)
      const content = await readFile(filePath, 'utf-8')
      return {
        content: [{ type: 'text', text: content }]
      }
    }
  })

  registerTool({
    name: 'read_sezione',
    description:
      'Legge una sezione specifica di un documento di fase, ' +
      'identificata dal testo dell\'heading. ' +
      'Se l\'heading non viene trovato, restituisce la lista degli heading disponibili.',
    schema: z.object({ path: z.string(), heading: z.string() }),
    category: 'conditional',
    requiredEnrichments: ['fasi-p0-p4'],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { path: relPath, heading } = z.object({
        path: z.string(),
        heading: z.string()
      }).parse(params)
      validateStrings({ path: relPath, heading })

      const filePath = resolveDocPath(relPath)
      const tree = await readAndParse(filePath)
      const section = findSectionByHeading(tree, heading)

      if (!section) {
        const available = listHeadings(tree)
        return {
          content: [{
            type: 'text',
            text: `Heading "${heading}" non trovato.\n\n` +
              `Heading disponibili:\n${available.join('\n')}`
          }],
          isError: true
        }
      }

      const subtree: Root = {
        type: 'root',
        children: tree.children.slice(section.startIndex, section.endIndex)
      }
      return {
        content: [{ type: 'text', text: stringifyMarkdown(subtree) }]
      }
    }
  })
}
