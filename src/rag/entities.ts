import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { parseMarkdown } from '../parser/markdown.js'
import { getHeadingText } from '../parser/sections.js'
import {
  documentiDir,
  processoDir,
  rfcDir
} from '../config/paths.js'
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

function composeSourceFile(
  physicalRoot: string,
  filePath: string,
  logicalPrefix: string
): string {
  const rel = relative(physicalRoot, filePath)
  return logicalPrefix ? `${logicalPrefix}/${rel}` : rel
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
  physicalRoot: string,
  logicalPrefix: string
): Promise<OperaEntity[]> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const tree = parseMarkdown(content)
    const sourceFile = composeSourceFile(physicalRoot, filePath, logicalPrefix)
    return extractH2Blocks(content, tree, type, sourceFile)
  } catch {
    return []
  }
}

async function parseWholeFile(
  filePath: string,
  type: EntityType,
  physicalRoot: string,
  logicalPrefix: string,
  idPrefix: string
): Promise<OperaEntity[]> {
  try {
    const content = await readFile(filePath, 'utf-8')
    const sourceFile = composeSourceFile(physicalRoot, filePath, logicalPrefix)
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

export async function parseAllEntities(): Promise<OperaEntity[]> {
  const entities: OperaEntity[] = []

  const governanceRoot = processoDir()
  const [questioni, mastro, note] = await Promise.all([
    parseBlockFile(
      join(governanceRoot, 'questioni.md'),
      'questione',
      governanceRoot,
      ''
    ),
    parseBlockFile(
      join(governanceRoot, 'mastro.md'),
      'mastro-entry',
      governanceRoot,
      ''
    ),
    parseBlockFile(
      join(governanceRoot, 'notes.md'),
      'nota',
      governanceRoot,
      ''
    )
  ])
  entities.push(...questioni, ...mastro, ...note)

  const rfcRoot = rfcDir()
  const rfcFiles = await collectMdFiles(rfcRoot)
  const rfcEntities = await Promise.all(
    rfcFiles.map(f => parseWholeFile(f, 'rfc', rfcRoot, 'rfc', 'RFC'))
  )
  for (const group of rfcEntities) {
    entities.push(...group)
  }

  const docRoot = documentiDir()
  const docFiles = await collectMdFiles(docRoot)
  const docEntities = await Promise.all(
    docFiles.map(f => parseWholeFile(f, 'documento', docRoot, 'documenti', 'DOC'))
  )
  for (const group of docEntities) {
    entities.push(...group)
  }

  return entities
}

export interface FileToReparse {
  /** Path assoluto del file su filesystem. */
  absolutePath: string
  /** Path "logico" relativo all'opera (es. "rfc/foo.md", "questioni.md"). */
  logicalPath: string
}

/**
 * Estrae entità solo dai file specificati (per sync incrementale dopo
 * confronto con il manifest). Determina il tipo dal logicalPath.
 */
export async function parseEntitiesFromFiles(
  files: FileToReparse[]
): Promise<OperaEntity[]> {
  const entities: OperaEntity[] = []

  for (const { absolutePath, logicalPath } of files) {
    if (logicalPath === 'questioni.md') {
      entities.push(...await parseBlockFile(
        absolutePath, 'questione', processoDir(), ''
      ))
    } else if (logicalPath === 'mastro.md') {
      entities.push(...await parseBlockFile(
        absolutePath, 'mastro-entry', processoDir(), ''
      ))
    } else if (logicalPath === 'notes.md') {
      entities.push(...await parseBlockFile(
        absolutePath, 'nota', processoDir(), ''
      ))
    } else if (
      logicalPath.startsWith('rfc/') &&
      logicalPath.endsWith('.md')
    ) {
      entities.push(...await parseWholeFile(
        absolutePath, 'rfc', rfcDir(), 'rfc', 'RFC'
      ))
    } else if (
      logicalPath.startsWith('documenti/') &&
      logicalPath.endsWith('.md')
    ) {
      entities.push(...await parseWholeFile(
        absolutePath, 'documento', documentiDir(), 'documenti', 'DOC'
      ))
    }
  }

  return entities
}
