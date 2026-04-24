import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getEnabledEnrichments, type HodosConfig } from './config-file.js'

describe('config-file', () => {
  describe('getEnabledEnrichments', () => {
    it('restituisce arricchimenti con enabled: true', () => {
      const config: HodosConfig = {
        arricchimenti: {
          'fasi-p0-p4': { enabled: true },
          'firma-utente': { enabled: false },
          'redazionale': { enabled: true, lingua: 'it_IT' }
        }
      }
      const result = getEnabledEnrichments(config)
      assert.deepEqual(result, ['fasi-p0-p4', 'redazionale'])
    })

    it('restituisce lista vuota se nessuno abilitato', () => {
      const config: HodosConfig = {
        arricchimenti: {
          'fasi-p0-p4': { enabled: false }
        }
      }
      assert.deepEqual(getEnabledEnrichments(config), [])
    })

    it('restituisce lista vuota con arricchimenti vuoti', () => {
      const config: HodosConfig = { arricchimenti: {} }
      assert.deepEqual(getEnabledEnrichments(config), [])
    })
  })
})
