import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { validateStrings } from '../../operations/validate.js'

const basePath = process.env.OPERA_BASE_PATH || '/opera'

const NOME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/

function validateNomeUnita(nome: string): void {
  if (!NOME_REGEX.test(nome)) {
    throw new Error(
      `Nome unità non valido: "${nome}". ` +
      `Usa solo alfanumerici minuscoli e trattini (kebab-case).`
    )
  }
}

function scaffoldSemplice(): Array<{ name: string; content: string }> {
  return [
    { name: 'design.md', content: '# Design\n' },
    { name: 'attivita.md', content: '# Attività\n' }
  ]
}

function scaffoldArticolato(): Array<{ name: string; content: string }> {
  return [
    { name: '0-design.md', content: '# Design\n' },
    { name: '1-obiettivi.md', content: '# Obiettivi\n' },
    { name: '2-scenari.md', content: '# Scenari\n' },
    { name: '3-requisiti.md', content: '# Requisiti\n' },
    { name: '4-vincoli.md', content: '# Vincoli\n' },
    { name: '5-struttura.md', content: '# Struttura\n' },
    { name: 'attivita.md', content: '# Attività\n' }
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

      const unitDir = path.join(basePath, 'documenti', 'unita', nome)

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

      const files = articolato ? scaffoldArticolato() : scaffoldSemplice()
      const creati: string[] = []

      for (const file of files) {
        await writeFile(path.join(unitDir, file.name), file.content, 'utf-8')
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
