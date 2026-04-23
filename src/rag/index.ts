/**
 * Facade RagEngine: punto di ingresso unico per il
 * sottosistema RAG. Init lazy, search, stato.
 */

import { operaRoot } from '../config/paths.js'
import * as embedder from './embedder.js'
import * as qdrant from './qdrant.js'
import * as gitSync from './git-sync.js'
import { parseAllEntities, parseEntitiesFromFiles } from './entities.js'
import { indexEntities, reindexFile, updateWatermark } from './indexer.js'
import type { EntityType } from './entities.js'

let available = false
let indexedCommit: string | null = null
let entityCount = 0

export function isAvailable(): boolean {
  return available
}

export function getStatus(): {
  available: boolean
  indexed_commit: string | null
  entity_count: number
} {
  return { available, indexed_commit: indexedCommit, entity_count: entityCount }
}

export async function initialize(): Promise<void> {
  const qdrantHost = process.env.QDRANT_HOST || 'localhost'
  const qdrantPort = parseInt(process.env.QDRANT_PORT || '6333', 10)

  try {
    await qdrant.init(qdrantHost, qdrantPort)
    await embedder.init()
    await qdrant.ensureCollection()

    const watermark = await qdrant.readWatermark()
    const isGit = await gitSync.isGitRepo(operaRoot)

    if (!isGit) {
      await syncComplete()
    } else {
      const head = await gitSync.getCurrentHead(operaRoot)

      if (!watermark) {
        await syncComplete()
        await updateWatermark(head)
        indexedCommit = head
      } else if (watermark !== head) {
        await syncIncremental(watermark)
        await updateWatermark(head)
        indexedCommit = head
      } else {
        indexedCommit = watermark
      }
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
  const entities = await parseAllEntities(operaRoot)
  await indexEntities(entities)
}

async function syncIncremental(fromCommit: string): Promise<void> {
  const changedFiles = await gitSync.getChangedFiles(operaRoot, fromCommit)

  const relevantFiles = changedFiles.filter(
    f => f === 'questioni.md'
      || f === 'mastro.md'
      || f === 'notes.md'
      || (f.startsWith('rfc/') && f.endsWith('.md'))
      || (f.startsWith('documenti/') && f.endsWith('.md'))
  )

  if (relevantFiles.length === 0) return

  const newEntities = await parseEntitiesFromFiles(operaRoot, relevantFiles)

  const sourceFiles = [...new Set(relevantFiles)]
  for (const sf of sourceFiles) {
    await reindexFile(sf, newEntities)
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
