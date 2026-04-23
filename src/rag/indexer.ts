/**
 * Indicizzatore: prende entità, genera embedding e
 * fa upsert in Qdrant a batch. Gestisce pulizia punti
 * obsoleti e watermark.
 */

import { createHash } from 'node:crypto'
import { embed } from './embedder.js'
import {
  upsertPoints,
  deletePoints,
  writeWatermark,
  getPointIdsBySourceFile
} from './qdrant.js'
import type { OperaEntity } from './entities.js'

const BATCH_SIZE = 20

function entityPointId(entity: OperaEntity): string {
  const hash = createHash('sha256')
    .update(`${entity.type}:${entity.id}:${entity.source_file}`)
    .digest('hex')
  // UUID v4-like dalla prima parte dell'hash
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    '8' + hash.slice(17, 20),
    hash.slice(20, 32)
  ].join('-')
}

function truncateContent(content: string, maxChars: number = 2000): string {
  if (content.length <= maxChars) return content
  return content.slice(0, maxChars) + '\n[...]'
}

export async function indexEntities(
  entities: OperaEntity[]
): Promise<number> {
  let indexed = 0

  for (let i = 0; i < entities.length; i += BATCH_SIZE) {
    const batch = entities.slice(i, i + BATCH_SIZE)
    const points = []

    for (const entity of batch) {
      const textForEmbedding = truncateContent(entity.content)
      const vector = await embed(textForEmbedding)
      points.push({
        id: entityPointId(entity),
        vector,
        payload: {
          entity_id: entity.id,
          entity_type: entity.type,
          source_file: entity.source_file,
          content: entity.content
        }
      })
    }

    await upsertPoints(points)
    indexed += points.length
  }

  return indexed
}

/**
 * Rimuove tutti i punti relativi a un file sorgente
 * e reindicizza le nuove entità estratte da quel file.
 */
export async function reindexFile(
  sourceFile: string,
  newEntities: OperaEntity[]
): Promise<void> {
  const oldIds = await getPointIdsBySourceFile(sourceFile)
  await deletePoints(oldIds)

  const fileEntities = newEntities.filter(
    e => e.source_file === sourceFile
  )
  if (fileEntities.length > 0) {
    await indexEntities(fileEntities)
  }
}

export async function updateWatermark(commit: string): Promise<void> {
  await writeWatermark(commit)
}
