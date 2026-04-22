import { registerReadRfc } from './read.js'
import { registerCreateRfc, registerUpdateRfc, registerWriteResponseRfc } from './write.js'

export function registerRfcTools(): void {
  registerReadRfc()
  registerCreateRfc()
  registerUpdateRfc()
  registerWriteResponseRfc()
}
