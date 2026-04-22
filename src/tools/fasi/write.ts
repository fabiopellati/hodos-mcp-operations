import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { validateStrings, validateEnum } from '../../operations/validate.js'

const basePath = process.env.OPERA_BASE_PATH || '/opera'

const FASE_DIRS: Record<string, string> = {
  P0: 'documenti/definizione',
  P1: 'documenti/analisi'
}

const VALID_FASI = ['P0', 'P1'] as const

const DOCUMENTI_PER_FASE: Record<string, string[]> = {
  P0: ['1-obiettivi', '2-panoramica-funzionalita'],
  P1: ['3-scenari', '4-requisiti', '5-vincoli', '6-struttura', '7-piano-esecutivo']
}

const TITOLI_DOCUMENTO: Record<string, string> = {
  '1-obiettivi': 'Obiettivi',
  '2-panoramica-funzionalita': 'Panoramica funzionalità',
  '3-scenari': 'Scenari',
  '4-requisiti': 'Requisiti',
  '5-vincoli': 'Vincoli',
  '6-struttura': 'Struttura',
  '7-piano-esecutivo': 'Piano esecutivo'
}

const SEZIONI_PER_DOCUMENTO: Record<string, string[]> = {
  '1-obiettivi': [
    'Contesto',
    'Obiettivi del progetto',
    'Stakeholder',
    'Criteri di successo'
  ],
  '2-panoramica-funzionalita': [
    'Funzionalità in scope',
    'Funzionalità fuori scope',
    'Priorità'
  ],
  '3-scenari': [
    'Attori',
    'Scenari principali',
    'Scenari secondari'
  ],
  '4-requisiti': [
    'Requisiti funzionali',
    'Requisiti non funzionali'
  ],
  '5-vincoli': [
    'Vincoli tecnici',
    'Vincoli organizzativi',
    'Vincoli temporali'
  ],
  '6-struttura': [
    'Stack tecnologico',
    'Componenti',
    'Flussi',
    'Decisioni architetturali'
  ],
  '7-piano-esecutivo': [
    'Componenti',
    'Ordine di sviluppo',
    'Milestone'
  ]
}

function generateScaffold(numeroNome: string): string {
  const titolo = TITOLI_DOCUMENTO[numeroNome] ?? numeroNome
  const sezioni = SEZIONI_PER_DOCUMENTO[numeroNome] ?? []

  let content = `# ${titolo}\n`

  for (const sezione of sezioni) {
    content += `\n## ${sezione}\n`
  }

  return content
}

export function registerFasiWriteTools(): void {
  registerTool({
    name: 'create_documento_fase',
    description:
      'Crea un nuovo documento di fase con struttura scaffold. ' +
      'Fase: P0 (definizione) o P1 (analisi). ' +
      'numero_nome: identificatore nel formato "numero-nome" ' +
      '(es. "1-obiettivi", "3-scenari").',
    schema: z.object({
      fase: z.string(),
      numero_nome: z.string()
    }),
    category: 'conditional',
    requiredEnrichments: ['fasi-p0-p4'],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { fase, numero_nome } = z.object({
        fase: z.string(),
        numero_nome: z.string()
      }).parse(params)

      validateStrings({ fase, numero_nome })
      validateEnum(fase, VALID_FASI, 'fase')

      const documentiValidi = DOCUMENTI_PER_FASE[fase]
      if (!documentiValidi.includes(numero_nome)) {
        return {
          content: [{
            type: 'text',
            text: `Documento "${numero_nome}" non valido per fase ${fase}. ` +
              `Documenti ammessi: ${documentiValidi.join(', ')}`
          }],
          isError: true
        }
      }

      const dir = path.join(basePath, FASE_DIRS[fase])
      const filePath = path.join(dir, `${numero_nome}.md`)

      if (existsSync(filePath)) {
        return {
          content: [{
            type: 'text',
            text: `Il file esiste già: ${FASE_DIRS[fase]}/${numero_nome}.md`
          }],
          isError: true
        }
      }

      await mkdir(dir, { recursive: true })
      const content = generateScaffold(numero_nome)
      await writeFile(filePath, content, 'utf-8')

      return {
        content: [{
          type: 'text',
          text: `Documento creato: ${FASE_DIRS[fase]}/${numero_nome}.md`
        }]
      }
    }
  })
}
