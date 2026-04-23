/**
 * Wrapper per embedding multilingua via @huggingface/transformers.
 * Import dinamico: il modulo non viene caricato finché init() non
 * è invocato. Il server base non dipende da questa libreria.
 */

const MODEL_NAME = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
export const EMBEDDING_DIM = 384

let pipeline: any = null

export async function init(): Promise<void> {
  if (pipeline) return
  const { pipeline: createPipeline } = await import(
    '@huggingface/transformers'
  )
  pipeline = await createPipeline(
    'feature-extraction',
    MODEL_NAME,
    { dtype: 'fp32' }
  )
}

export async function embed(text: string): Promise<number[]> {
  if (!pipeline) throw new Error('Embedder non inizializzato')
  const output = await pipeline(text, {
    pooling: 'mean',
    normalize: true
  })
  return Array.from(output.data as Float32Array).slice(0, EMBEDDING_DIM)
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = []
  for (const text of texts) {
    results.push(await embed(text))
  }
  return results
}
