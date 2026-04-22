import { registerFasiReadTools } from './read.js'
import { registerFasiWriteTools } from './write.js'
import { registerUnitaWriteTools } from '../unita/write.js'
import { registerAttivitaReadTools } from '../attivita/read.js'
import { registerAttivitaWriteTools } from '../attivita/write.js'

/**
 * Registra tutti i tool dell'unità U4 (fasi P0-P4, unità, attività).
 * Tutti i tool sono conditional con requiredEnrichments: ['fasi-p0-p4'].
 */
export function registerFasiTools(): void {
  registerFasiReadTools()
  registerFasiWriteTools()
  registerUnitaWriteTools()
  registerAttivitaReadTools()
  registerAttivitaWriteTools()
}
