import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { parseMarkdown } from '../parser/markdown.js'
import { getHeadingText } from '../parser/sections.js'
import type { Root, RootContent } from 'mdast'

export type EntityType =
  | 'questione'
  | 'mastro-entry'
  | 'nota'
  | 'rfc'
  | 'documento'

export interface OperaEntity {
  id: string
  type: EntityType
  source_file: string
  content: string
}

function nodeStartOffset(node: RootContent): number {
  return node.position?.start.offset ?? 0
}

function nodeEndOffset(node: RootContent): number {
  return node.position?.end.offset ?? 0
}

/**
 * Estrae blocchi H2+thematicBreak da un file markdown.
 * Ogni blocco va dall'heading H2 al thematicBreak successivo
 * (o alla fine del file).
 */
function extractH2Blocks(
  content: string,
  tree: Root,
  type: EntityType,
  sourceFile: string
): OperaEntity[] {
  const entities: OperaEntity[] = []
  const children = tree.children

  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (node.type !== 'heading' || node.depth !== 2) continue

    const headingText = getHeadingText(node)
    const id = extractId(headingText, type)
    if (!id) continue

    let endOffset = tree.position?.end.offset ?? content.length
    for (let j = i + 1; j < children.length; j++) {
      if (children[j].type === 'thematicBreak') {
        endOffset = nodeStartOffset(children[j])
        break
      }
      if (children[j].type === 'heading' && (children[j] as import('mdast').Heading).depth <= 2) {
        endOffset = nodeStartOffset(children[j])
        break
      }
    }

    const blockContent = content.slice(
      nodeStartOffset(node),
      endOffset
    ).trim()

    if (blockContent) {
      entities.push({ id, type, source_file: sourceFile, content: blockContent })
    }
  }

  return entities
}

function extractId(headingText: string, type: EntityType): string | null {
  switch (type) {
    case 'questione': {
      const m = headingText.match(/QUESTIONE-\d+/)
      return m ? m[0] : null
    }
    case 'mastro-entry': {
      const m = headingText.match(/QUESTIONE-\d+/)
      return m ? `MASTRO-${m[0]}` : null
    }
    case 'nota': {
      const m = headingText.match(/NOTA-\d+/)
      return m ? m[0] : null
    }
    default:
      return null
  }
}

async function parseBlockFile(
  filePath: string,
  type: EntityType,
  operaRoot: string
): Promise<OperaEntity[]> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const tree = parseMarkdown(content)
    const sourceFile = relative(operaRoot, filePath)
    return extractH2Blocks(content, tree, type, sourceFile)
  } catch {
    return []
  }
}

async function parseWholeFile(
  filePath: string,
  type: EntityType,
  operaRoot: string,
  idPrefix: string
): Promise<OperaEntity[]> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const sourceFile = relative(operaRoot, filePath)
    const baseName = sourceFile
      .replace(/\.md$/, '')
      .replace(/^(rfc|documenti)[/\\]/, '')
      .replace(/[/\\]/g, '-')
    return [{
      id: `${idPrefix}-${baseName}`,
      type,
      source_file: sourceFile,
      content: content.trim()
    }]
  } catch {
    return []
  }
}

async function collectMdFiles(dir: string): Promise<string[]> {
  const files: string[] = []
  try {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const parentPath = entry.parentPath ?? entry.path ?? dir
        files.push(join(parentPath, entry.name))
      }
    }
  } catch {
    // directory non esistente
  }
  return files
}

export async function parseAllEntities(operaRoot: string): Promise<OperaEntity[]> {
  const entities: OperaEntity[] = []

  const [questioni, mastro, note] = await Promise.all([
    parseBlockFile(join(operaRoot, 'questioni.md'), 'questione', operaRoot),
    parseBlockFile(join(operaRoot, 'mastro.md'), 'mastro-entry', operaRoot),
    parseBlockFile(join(operaRoot, 'notes.md'), 'nota', operaRoot)
  ])
  entities.push(...questioni, ...mastro, ...note)

  const rfcFiles = await collectMdFiles(join(operaRoot, 'rfc'))
  const rfcEntities = await Promise.all(
    rfcFiles.map(f => parseWholeFile(f, 'rfc', operaRoot, 'RFC'))
  )
  for (const group of rfcEntities) {
    entities.push(...group)
  }

  const docFiles = await collectMdFiles(join(operaRoot, 'documenti'))
  const docEntities = await Promise.all(
    docFiles.map(f => parseWholeFile(f, 'documento', operaRoot, 'DOC'))
  )
  for (const group of docEntities) {
    entities.push(...group)
  }

  return entities
}

/**
 * Estrae entità solo dai file specificati (per sync incrementale).
 * I path sono relativi a operaRoot.
 */
export async function parseEntitiesFromFiles(
  operaRoot: string,
  relativePaths: string[]
): Promise<OperaEntity[]> {
  const entities: OperaEntity[] = []

  for (const rel of relativePaths) {
    const fullPath = join(operaRoot, rel)

    if (rel === 'questioni.md') {
      entities.push(...await parseBlockFile(fullPath, 'questione', operaRoot))
    } else if (rel === 'mastro.md') {
      entities.push(...await parseBlockFile(fullPath, 'mastro-entry', operaRoot))
    } else if (rel === 'notes.md') {
      entities.push(...await parseBlockFile(fullPath, 'nota', operaRoot))
    } else if (rel.startsWith('rfc/') && rel.endsWith('.md')) {
      entities.push(...await parseWholeFile(fullPath, 'rfc', operaRoot, 'RFC'))
    } else if (rel.startsWith('documenti/') && rel.endsWith('.md')) {
      entities.push(...await parseWholeFile(fullPath, 'documento', operaRoot, 'DOC'))
    }
  }

  return entities
}
