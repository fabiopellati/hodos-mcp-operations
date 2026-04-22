import { getActiveEnrichments } from '../server.js'

export function isCompressioneActive(): boolean {
  return getActiveEnrichments().includes('compressione-mastro')
}

export function isPercorsoRequired(): boolean {
  return !isCompressioneActive()
}
