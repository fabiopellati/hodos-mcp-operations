import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { today, now } from './date.js'

describe('date', () => {
  describe('today', () => {
    it('restituisce formato Y-m-d senza arricchimento attivo', () => {
      const result = today()
      assert.match(result, /^\d{4}-\d{2}-\d{2}$/)
    })

    it('la data contiene anno, mese e giorno validi', () => {
      const result = today()
      const [year, month, day] = result.split('-').map(Number)
      assert.ok(year >= 2024 && year <= 2030)
      assert.ok(month >= 1 && month <= 12)
      assert.ok(day >= 1 && day <= 31)
    })
  })

  describe('now', () => {
    it('restituisce formato Y-m-d H:i senza arricchimento attivo', () => {
      const result = now()
      assert.match(result, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    })
  })
})
