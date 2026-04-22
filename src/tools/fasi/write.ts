import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { readRaw, replaceRange } from '../../operations/atomic.js'
import { parseMarkdown } from '../../parser/markdown.js'
import { findSectionByHeading, getHeadingText } from '../../parser/sections.js'
import { validateStrings, validateEnum } from '../../operations/validate.js'
import type { Heading } from 'mdast'

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

function resolveDocPath(relativePath: string): string {
  const normalized = path.normalize(relativePath)
  if (!normalized.startsWith('documenti/') && !normalized.startsWith('documenti\\')) {
    throw new Error(
      `Il path deve essere sotto "documenti/". Ricevuto: ${relativePath}`
    )
  }
  const full = path.resolve(basePath, normalized)
  if (!full.startsWith(path.join(basePath, 'documenti'))) {
    throw new Error(`Path non valido: ${relativePath}`)
  }
  return full
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

  registerTool({
    name: 'write_sezione',
    description:
      'Scrive il contenuto di una sezione in un documento di fase. ' +
      'Sostituisce tutto il contenuto tra l\'heading indicato e il prossimo ' +
      'heading di pari livello. ' +
      'path: relativo a OPERA_BASE_PATH (es. "documenti/definizione/1-obiettivi.md"). ' +
      'heading: testo dell\'heading della sezione da scrivere. ' +
      'contenuto: markdown da inserire come corpo della sezione.',
    schema: z.object({
      path: z.string(),
      heading: z.string(),
      contenuto: z.string()
    }),
    category: 'conditional',
    requiredEnrichments: ['fasi-p0-p4'],
    handler: async (params: unknown): Promise<ToolResult> => {
      const { path: relPath, heading, contenuto } = z.object({
        path: z.string(),
        heading: z.string(),
        contenuto: z.string()
      }).parse(params)

      validateStrings({ path: relPath, heading, contenuto })

      const filePath = resolveDocPath(relPath)
      const content = await readRaw(filePath)
      const tree = parseMarkdown(content)
      const section = findSectionByHeading(tree, heading)

      if (!section) {
        const available = tree.children
          .filter((n): n is Heading => n.type === 'heading')
          .map(h => `${'#'.repeat(h.depth)} ${getHeadingText(h)}`)
        throw new Error(
          `Heading "${heading}" non trovato.\n` +
          `Heading disponibili:\n${available.join('\n')}`
        )
      }

      // L'heading originale va preservato: il contenuto della sezione
      // è tra la fine dell'heading e l'inizio della sezione successiva.
      const headingNode = tree.children[section.startIndex]
      const bodyStart = headingNode.position?.end.offset ?? section.startOffset
      const bodyEnd = section.endOffset

      const newBody = '\n\n' + contenuto.trim() + '\n'
      const modified = replaceRange(content, bodyStart, bodyEnd, newBody)
      await writeFile(filePath, modified, 'utf-8')

      return {
        content: [{
          type: 'text',
          text: `Sezione "${heading}" aggiornata in ${relPath}.`
        }]
      }
    }
  })
}
