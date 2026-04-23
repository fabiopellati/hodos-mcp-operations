/**
 * Client Qdrant con gestione collection e watermark.
 * Import dinamico: la libreria non viene caricata finché
 * init() non è invocato.
 */

import { EMBEDDING_DIM } from './embedder.js'
import type { EntityType } from './entities.js'

const COLLECTION_NAME = 'opera_entities'
const WATERMARK_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff'

export interface EntityPayload {
  entity_id: string
  entity_type: EntityType
  source_file: string
  content: string
}

interface PointStruct {
  id: string
  vector: number[]
  payload: Record<string, unknown>
}

let client: any = null

export async function init(
  host: string = 'localhost',
  port: number = 6333
): Promise<void> {
  if (client) return
  const { QdrantClient } = await import('@qdrant/js-client-rest')
  client = new QdrantClient({ host, port })
}

export function getClient(): any {
  if (!client) throw new Error('Qdrant client non inizializzato')
  return client
}

export async function ensureCollection(): Promise<void> {
  const c = getClient()
  const collections = await c.getCollections()
  const exists = collections.collections.some(
    (col: { name: string }) => col.name === COLLECTION_NAME
  )
  if (!exists) {
    await c.createCollection(COLLECTION_NAME, {
      vectors: { size: EMBEDDING_DIM, distance: 'Cosine' }
    })
  }
}

export async function upsertPoints(
  points: PointStruct[]
): Promise<void> {
  if (points.length === 0) return
  const c = getClient()
  await c.upsert(COLLECTION_NAME, { points })
}

export async function deletePoints(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const c = getClient()
  await c.delete(COLLECTION_NAME, {
    points: ids
  })
}

export async function search(
  vector: number[],
  limit: number,
  entityType?: EntityType
): Promise<Array<{
  id: string
  score: number
  payload: EntityPayload
}>> {
  const c = getClient()
  const filter = entityType
    ? { must: [{ key: 'entity_type', match: { value: entityType } }] }
    : undefined

  const results = await c.search(COLLECTION_NAME, {
    vector,
    limit,
    filter,
    with_payload: true
  })

  return results.map((r: any) => ({
    id: r.id,
    score: r.score,
    payload: r.payload as EntityPayload
  }))
}

export async function readWatermark(): Promise<string | null> {
  const c = getClient()
  try {
    const points = await c.retrieve(COLLECTION_NAME, {
      ids: [WATERMARK_ID],
      with_payload: true
    })
    if (points.length > 0 && points[0].payload?.commit) {
      return points[0].payload.commit as string
    }
  } catch {
    // collection non esiste ancora
  }
  return null
}

export async function writeWatermark(commit: string): Promise<void> {
  const c = getClient()
  await c.upsert(COLLECTION_NAME, {
    points: [{
      id: WATERMARK_ID,
      vector: new Array(EMBEDDING_DIM).fill(0),
      payload: { commit, _type: 'watermark' }
    }]
  })
}

export async function countEntities(): Promise<number> {
  const c = getClient()
  try {
    const info = await c.getCollection(COLLECTION_NAME)
    const total = info.points_count ?? 0
    return Math.max(0, total - 1) // escludi watermark
  } catch {
    return 0
  }
}

export async function getPointIdsBySourceFile(
  sourceFile: string
): Promise<string[]> {
  const c = getClient()
  const result = await c.scroll(COLLECTION_NAME, {
    filter: {
      must: [{ key: 'source_file', match: { value: sourceFile } }]
    },
    with_payload: false,
    limit: 10000
  })
  return result.points.map((p: any) => p.id as string)
}
