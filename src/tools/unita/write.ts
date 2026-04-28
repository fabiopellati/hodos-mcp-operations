import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { validateStrings } from '../../operations/validate.js'
import { documentiDir } from '../../config/paths.js'

const NOME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/

function validateNomeUnita(nome: string): void {
  if (!NOME_REGEX.test(nome)) {
    throw new Error(
      `Nome unità non valido: "${nome}". ` +
      `Usa solo alfanumerici minuscoli e trattini (kebab-case).`
    )
  }
}

function scaffoldSemplice(nome: string): Array<{ name: string; content: string }> {
  return [
    { name: 'design.md', content: `# Design — ${nome}\n` },
    { name: 'attivita.md', content: `# Attività — ${nome}\n` }
  ]
}

function scaffoldArticolato(nome: string): Array<{ name: string; content: string }> {
  return [
    { name: '0-design.md', content: `# Design — ${nome}\n` },
    { name: '1-obiettivi.md', content: `# Obiettivi — ${nome}\n` },
    { name: '2-scenari.md', content: `# Scenari — ${nome}\n` },
    { name: '3-requisiti.md', content: `# Requisiti — ${nome}\n` },
    { name: '4-vincoli.md', content: `# Vincoli — ${nome}\n` },
    { name: '5-struttura.md', content: `# Struttura — ${nome}\n` },
    { name: 'attivita.md', content: `# Attività — ${nome}\n` }
  ]
}

export function registerUnitaWriteTools(): void {
  registerTool({
    name: 'create_unita',
    description:
      'Crea una nuova unità in documenti/unita/{nome}/. ' +
      'Se articolato è true, genera documenti dettagliati; ' +
      'altrimenti solo design.md e attivita.md.',
    schema: z.object({
      nome: z.string(),
      articolato: z.boolean().optional()
    }),
    category: 'conditional',
    requiredEnrichments: ['fasi-p0-p4'],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { nome, articolato = false } = z.object({
        nome: z.string(),
        articolato: z.boolean().optional()
      }).parse(params)

      validateStrings({ nome })
      validateNomeUnita(nome)

      const unitDir = join(documentiDir(), 'unita', nome)

      if (existsSync(unitDir)) {
        return {
          content: [{
            type: 'text',
            text: `L'unità "${nome}" esiste già: documenti/unita/${nome}/`
          }],
          isError: true
        }
      }

      await mkdir(unitDir, { recursive: true })

      const files = articolato ? scaffoldArticolato(nome) : scaffoldSemplice(nome)
      const creati: string[] = []

      for (const file of files) {
        await writeFile(join(unitDir, file.name), file.content, 'utf-8')
        creati.push(file.name)
      }

      return {
        content: [{
          type: 'text',
          text: `Unità "${nome}" creata in documenti/unita/${nome}/\n` +
            `File: ${creati.join(', ')}`
        }]
      }
    }
  })
}
