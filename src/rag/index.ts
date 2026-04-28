/**
 * Facade RagEngine: punto di ingresso unico per il
 * sottosistema RAG. Init lazy, search, stato.
 */

import * as embedder from './embedder.js'
import * as qdrant from './qdrant.js'
import {
  parseAllEntities,
  parseEntitiesFromFiles,
  type FileToReparse
} from './entities.js'
import { indexEntities, removeFile } from './indexer.js'
import {
  applyDiffToManifest,
  buildManifestFromScan,
  diffScanWithManifest,
  loadManifest,
  saveManifest,
  scanAllRoots
} from './manifest.js'
import type { EntityType } from './entities.js'

let available = false
let indexedFiles = 0
let entityCount = 0

export function isAvailable(): boolean {
  return available
}

export function getStatus(): {
  available: boolean
  indexed_files: number
  entity_count: number
} {
  return { available, indexed_files: indexedFiles, entity_count: entityCount }
}

export async function initialize(): Promise<void> {
  const qdrantHost = process.env.QDRANT_HOST || 'localhost'
  const qdrantPort = parseInt(process.env.QDRANT_PORT || '6333', 10)

  try {
    await qdrant.init(qdrantHost, qdrantPort)
    await embedder.init()
    await qdrant.ensureCollection()

    const manifest = await loadManifest()
    const scan = await scanAllRoots()

    if (Object.keys(manifest.files).length === 0) {
      await syncComplete()
      const fresh = buildManifestFromScan(scan)
      await saveManifest(fresh)
      indexedFiles = Object.keys(fresh.files).length
    } else {
      const diff = diffScanWithManifest(scan, manifest)
      await syncDelta(diff)
      const updated = applyDiffToManifest(manifest, diff)
      await saveManifest(updated)
      indexedFiles = Object.keys(updated.files).length
    }

    entityCount = await qdrant.countEntities()
    available = true
  } catch (err) {
    available = false
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`RAG init fallito: ${msg}`)
  }
}

async function syncComplete(): Promise<void> {
  const entities = await parseAllEntities()
  await indexEntities(entities)
}

async function syncDelta(diff: {
  added: Array<{ absolutePath: string; logicalPath: string }>
  modified: Array<{ absolutePath: string; logicalPath: string }>
  removed: string[]
}): Promise<void> {
  const toReparse: FileToReparse[] = [...diff.added, ...diff.modified]

  if (toReparse.length > 0) {
    const newEntities = await parseEntitiesFromFiles(toReparse)
    const sourceFiles = [...new Set(toReparse.map(f => f.logicalPath))]
    for (const sf of sourceFiles) {
      const fileEntities = newEntities.filter(e => e.source_file === sf)
      await removeFile(sf)
      if (fileEntities.length > 0) {
        await indexEntities(fileEntities)
      }
    }
  }

  for (const removedPath of diff.removed) {
    await removeFile(removedPath)
  }
}

export async function search(
  query: string,
  limit: number = 5,
  entityType?: EntityType
): Promise<Array<{
  entity_id: string
  entity_type: EntityType
  source_file: string
  score: number
  content_excerpt: string
}>> {
  if (!available) {
    throw new Error('RAG non disponibile')
  }

  const vector = await embedder.embed(query)
  const results = await qdrant.search(vector, limit, entityType)

  return results.map(r => ({
    entity_id: r.payload.entity_id,
    entity_type: r.payload.entity_type,
    source_file: r.payload.source_file,
    score: r.score,
    content_excerpt: r.payload.content.slice(0, 500)
  }))
}
