/**
 * Manifest persistente del modulo RAG: traccia hash e mtime di
 * ciascun file indicizzato per individuare i delta senza dipendere
 * da git. Rimpiazza il watermark git-based.
 */

import { createHash } from 'node:crypto'
import {
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile
} from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import {
  documentiDir,
  processoDir,
  rfcDir
} from '../config/paths.js'

const MANIFEST_VERSION = 1

const manifestPath = process.env.HODOS_RAG_MANIFEST
  || '/var/lib/hodos/rag-state.json'

export interface ManifestEntry {
  hash: string
  mtime: number
}

export interface RagManifest {
  version: number
  files: Record<string, ManifestEntry>
}

export interface ScannedFile {
  /** Path assoluto sul filesystem. */
  absolutePath: string
  /** Path logico relativo all'opera (es. "rfc/foo.md"). */
  logicalPath: string
  hash: string
  mtime: number
}

export interface ManifestDiff {
  /** Nuovi file da indicizzare. */
  added: ScannedFile[]
  /** File modificati (hash diverso). */
  modified: ScannedFile[]
  /** Path logici di file rimossi dal filesystem. */
  removed: string[]
}

export async function loadManifest(): Promise<RagManifest> {
  try {
    const content = await readFile(manifestPath, 'utf-8')
    const parsed = JSON.parse(content)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      parsed.version === MANIFEST_VERSION &&
      typeof parsed.files === 'object'
    ) {
      return parsed as RagManifest
    }
    return { version: MANIFEST_VERSION, files: {} }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { version: MANIFEST_VERSION, files: {} }
    }
    console.error(`Errore lettura manifest RAG (${manifestPath}):`, err)
    return { version: MANIFEST_VERSION, files: {} }
  }
}

export async function saveManifest(manifest: RagManifest): Promise<void> {
  try {
    await mkdir(dirname(manifestPath), { recursive: true })
    const content = JSON.stringify(manifest, null, 2)
    await writeFile(manifestPath, content, 'utf-8')
  } catch (err) {
    console.error(`Errore scrittura manifest RAG (${manifestPath}):`, err)
  }
}

async function computeFileHash(filePath: string): Promise<string> {
  const content = await readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}

async function statFileSafe(
  filePath: string
): Promise<{ mtime: number } | null> {
  try {
    const s = await stat(filePath)
    return { mtime: s.mtimeMs }
  } catch {
    return null
  }
}

async function scanRootMd(
  physicalRoot: string,
  logicalPrefix: string
): Promise<ScannedFile[]> {
  const result: ScannedFile[] = []
  let entries
  try {
    entries = await readdir(physicalRoot, {
      withFileTypes: true,
      recursive: true
    })
  } catch {
    return result
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const parentPath = entry.parentPath ?? entry.path ?? physicalRoot
    const absolutePath = join(parentPath, entry.name)
    const rel = relative(physicalRoot, absolutePath)
    const logicalPath = logicalPrefix
      ? `${logicalPrefix}/${rel}`
      : rel
    const meta = await statFileSafe(absolutePath)
    if (!meta) continue
    const hash = await computeFileHash(absolutePath)
    result.push({
      absolutePath,
      logicalPath,
      hash,
      mtime: meta.mtime
    })
  }
  return result
}

async function scanGovernanceFiles(): Promise<ScannedFile[]> {
  const root = processoDir()
  const candidates = ['questioni.md', 'mastro.md', 'notes.md']
  const result: ScannedFile[] = []
  for (const name of candidates) {
    const absolutePath = join(root, name)
    const meta = await statFileSafe(absolutePath)
    if (!meta) continue
    const hash = await computeFileHash(absolutePath)
    result.push({
      absolutePath,
      logicalPath: name,
      hash,
      mtime: meta.mtime
    })
  }
  return result
}

/**
 * Esegue lo scan di tutte le radici semantiche e raccoglie hash+mtime
 * per ciascun file markdown rilevante.
 */
export async function scanAllRoots(): Promise<ScannedFile[]> {
  const [governance, rfc, documenti] = await Promise.all([
    scanGovernanceFiles(),
    scanRootMd(rfcDir(), 'rfc'),
    scanRootMd(documentiDir(), 'documenti')
  ])
  return [...governance, ...rfc, ...documenti]
}

export function diffScanWithManifest(
  scan: ScannedFile[],
  manifest: RagManifest
): ManifestDiff {
  const added: ScannedFile[] = []
  const modified: ScannedFile[] = []
  const seen = new Set<string>()

  for (const file of scan) {
    seen.add(file.logicalPath)
    const prev = manifest.files[file.logicalPath]
    if (!prev) {
      added.push(file)
    } else if (prev.hash !== file.hash) {
      modified.push(file)
    }
  }

  const removed: string[] = []
  for (const logicalPath of Object.keys(manifest.files)) {
    if (!seen.has(logicalPath)) {
      removed.push(logicalPath)
    }
  }

  return { added, modified, removed }
}

export function applyDiffToManifest(
  manifest: RagManifest,
  diff: ManifestDiff
): RagManifest {
  const files = { ...manifest.files }
  for (const f of [...diff.added, ...diff.modified]) {
    files[f.logicalPath] = { hash: f.hash, mtime: f.mtime }
  }
  for (const path of diff.removed) {
    delete files[path]
  }
  return { version: MANIFEST_VERSION, files }
}

export function buildManifestFromScan(scan: ScannedFile[]): RagManifest {
  const files: Record<string, ManifestEntry> = {}
  for (const f of scan) {
    files[f.logicalPath] = { hash: f.hash, mtime: f.mtime }
  }
  return { version: MANIFEST_VERSION, files }
}
