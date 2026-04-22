import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { registerTool, type ToolResult } from '../../server.js'
import { validateStrings, validateEnum } from '../../operations/validate.js'
import { readRaw, replaceRange } from '../../operations/atomic.js'
import { parseMarkdown } from '../../parser/markdown.js'
import { findSectionByHeading } from '../../parser/sections.js'
import { findRfcFile } from './read.js'

const basePath = process.env.OPERA_BASE_PATH || '/opera'
const rfcDir = join(basePath, 'rfc')

const VALID_RFC_STATES = ['accepted', 'rejected', 'deferred'] as const

const datePattern = /^\d{4}-\d{2}-\d{2}$/

function validateDate(value: string, paramName: string): void {
  if (!datePattern.test(value)) {
    throw new Error(
      `Formato data non valido per "${paramName}": "${value}". ` +
      `Atteso formato YYYY-MM-DD.`
    )
  }
}

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50)
}

/**
 * Verifica se la Response RFC è già compilata controllando
 * se il campo "Data risposta" ha un valore dopo i due punti.
 */
function isResponseCompiled(content: string): boolean {
  const match = content.match(/\*\*Data risposta\*\*:\s*(.*)/)
  if (!match) return false
  return match[1].trim().length > 0
}

// --- create_rfc ---

const createRfcSchema = z.object({
  questione_id: z.string(),
  data: z.string(),
  da: z.string(),
  a: z.string(),
  contesto: z.string(),
  richiesta: z.string(),
  motivazione: z.string(),
  criteri: z.string()
})

function buildRfcContent(params: z.infer<typeof createRfcSchema>): string {
  return `# RFC — ${params.questione_id}

**Data**: ${params.data}
**Da**: ${params.da}
**A**: ${params.a}
**Questione di origine**: ${params.questione_id}

## Contesto

${params.contesto}

## Richiesta

${params.richiesta}

## Motivazione

${params.motivazione}

## Criteri di Accettazione

${params.criteri}

---

## Response RFC

**Data risposta**:
**Stato**:
**Da**:
**A**:

### Decisione

### Lavoro svolto

### Deviazioni
`
}

async function handleCreateRfc(params: unknown): Promise<ToolResult> {
  const parsed = createRfcSchema.parse(params)
  validateStrings({
    questione_id: parsed.questione_id,
    data: parsed.data,
    da: parsed.da,
    a: parsed.a,
    contesto: parsed.contesto,
    richiesta: parsed.richiesta,
    motivazione: parsed.motivazione,
    criteri: parsed.criteri
  })
  validateDate(parsed.data, 'data')

  // Verifica che non esista già un file RFC per lo stesso ID
  try {
    await findRfcFile(parsed.questione_id)
    return {
      content: [{
        type: 'text',
        text: `Esiste già un file RFC per la questione "${parsed.questione_id}"`
      }],
      isError: true
    }
  } catch {
    // Nessun file trovato: possiamo procedere
  }

  const slug = toSlug(parsed.questione_id)
  const fileName = `rfc-${slug}.md`
  const filePath = join(rfcDir, fileName)

  try {
    await mkdir(rfcDir, { recursive: true })
    const content = buildRfcContent(parsed)
    await writeFile(filePath, content, 'utf-8')
    return {
      content: [{
        type: 'text',
        text: `File RFC creato: ${fileName}`
      }]
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: (err as Error).message }],
      isError: true
    }
  }
}

// --- update_rfc ---

const SECTION_MAP: Record<string, string> = {
  contesto: 'Contesto',
  richiesta: 'Richiesta',
  motivazione: 'Motivazione',
  criteri: 'Criteri di Accettazione'
}

const updateRfcSchema = z.object({
  questione_id: z.string(),
  sezione: z.string(),
  contenuto: z.string()
})

async function handleUpdateRfc(params: unknown): Promise<ToolResult> {
  const parsed = updateRfcSchema.parse(params)
  validateStrings({
    questione_id: parsed.questione_id,
    sezione: parsed.sezione,
    contenuto: parsed.contenuto
  })

  const headingText = SECTION_MAP[parsed.sezione]
  if (!headingText) {
    return {
      content: [{
        type: 'text',
        text: `Sezione "${parsed.sezione}" non valida. ` +
          `Sezioni ammesse: ${Object.keys(SECTION_MAP).join(', ')}`
      }],
      isError: true
    }
  }

  try {
    const filePath = await findRfcFile(parsed.questione_id)
    const content = await readRaw(filePath)

    if (isResponseCompiled(content)) {
      return {
        content: [{
          type: 'text',
          text: 'Impossibile modificare la RFC: la Response è già compilata.'
        }],
        isError: true
      }
    }

    const tree = parseMarkdown(content)
    const section = findSectionByHeading(tree, headingText, 2)
    if (!section) {
      throw new Error(
        `Sezione "${headingText}" non trovata nel file RFC`
      )
    }

    // L'heading occupa dalla startOffset alla fine della riga di heading.
    // Il contenuto della sezione parte dopo l'heading node.
    const headingNode = tree.children[section.startIndex]
    const contentStart = headingNode.position?.end.offset ?? section.startOffset
    const contentEnd = section.endOffset

    const newContent = `\n\n${parsed.contenuto}\n\n`
    const updated = replaceRange(content, contentStart, contentEnd, newContent)
    await writeFile(filePath, updated, 'utf-8')

    return {
      content: [{
        type: 'text',
        text: `Sezione "${parsed.sezione}" aggiornata nel file RFC per "${parsed.questione_id}"`
      }]
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: (err as Error).message }],
      isError: true
    }
  }
}

// --- write_response_rfc ---

const writeResponseRfcSchema = z.object({
  questione_id: z.string(),
  data: z.string(),
  stato: z.string(),
  da: z.string(),
  a: z.string(),
  decisione: z.string(),
  lavoro: z.string(),
  deviazioni: z.string()
})

async function handleWriteResponseRfc(params: unknown): Promise<ToolResult> {
  const parsed = writeResponseRfcSchema.parse(params)
  validateStrings({
    questione_id: parsed.questione_id,
    data: parsed.data,
    stato: parsed.stato,
    da: parsed.da,
    a: parsed.a,
    decisione: parsed.decisione,
    lavoro: parsed.lavoro,
    deviazioni: parsed.deviazioni
  })
  validateDate(parsed.data, 'data')
  validateEnum(parsed.stato, VALID_RFC_STATES, 'stato')

  try {
    const filePath = await findRfcFile(parsed.questione_id)
    const content = await readRaw(filePath)

    if (isResponseCompiled(content)) {
      return {
        content: [{
          type: 'text',
          text: 'Impossibile compilare la Response: è già compilata.'
        }],
        isError: true
      }
    }

    const responseMarker = '## Response RFC'
    const markerIndex = content.indexOf(responseMarker)
    if (markerIndex === -1) {
      return {
        content: [{
          type: 'text',
          text: 'Sezione "## Response RFC" non trovata nel file RFC.'
        }],
        isError: true
      }
    }

    const newResponseContent = `## Response RFC

**Data risposta**: ${parsed.data}
**Stato**: ${parsed.stato}
**Da**: ${parsed.da}
**A**: ${parsed.a}

### Decisione

${parsed.decisione}

### Lavoro svolto

${parsed.lavoro}

### Deviazioni

${parsed.deviazioni}
`
    const updatedContent = content.slice(0, markerIndex) + newResponseContent
    await writeFile(filePath, updatedContent, 'utf-8')

    return {
      content: [{
        type: 'text',
        text: `Response RFC compilata per la questione "${parsed.questione_id}"`
      }]
    }
  } catch (err) {
    return {
      content: [{ type: 'text', text: (err as Error).message }],
      isError: true
    }
  }
}

// --- Registrazione ---

export function registerCreateRfc(): void {
  registerTool({
    name: 'create_rfc',
    description:
      'Crea un nuovo file RFC per una questione. ' +
      'Genera il file nella directory rfc/ con la struttura standard.',
    schema: createRfcSchema,
    category: 'base',
    requiredEnrichments: [],
    handler: handleCreateRfc
  })
}

export function registerUpdateRfc(): void {
  registerTool({
    name: 'update_rfc',
    description:
      'Aggiorna una sezione specifica di un file RFC esistente. ' +
      'Sezioni valide: contesto, richiesta, motivazione, criteri. ' +
      'Non modifica se la Response è già compilata.',
    schema: updateRfcSchema,
    category: 'base',
    requiredEnrichments: [],
    handler: handleUpdateRfc
  })
}

export function registerWriteResponseRfc(): void {
  registerTool({
    name: 'write_response_rfc',
    description:
      'Compila la sezione Response di un file RFC. ' +
      'Valori ammessi per stato: accepted, rejected, deferred.',
    schema: writeResponseRfcSchema,
    category: 'base',
    requiredEnrichments: [],
    handler: handleWriteResponseRfc
  })
}
