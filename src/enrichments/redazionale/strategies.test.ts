import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getStrategy, getSupportedLocales } from './strategies.js'

describe('strategies', () => {
  describe('getStrategy', () => {
    it('restituisce i default per it_IT', () => {
      const s = getStrategy('it_IT')
      assert.equal(s['wrap-colonne'], 80)
      assert.equal(s.accenti, true)
      assert.equal(s.emoji, false)
      assert.equal(s['stile-discorsivo'], true)
      assert.equal(s['tabelle-markdown'], false)
      assert.equal(s['formato-data'], 'd/m/Y')
      assert.equal(s['formato-ora'], 'H:i')
    })

    it('lancia errore per locale non supportata', () => {
      assert.throws(() => getStrategy('en_US'), /non supportata/)
    })
  })

  describe('getSupportedLocales', () => {
    it('include it_IT', () => {
      const locales = getSupportedLocales()
      assert.ok(locales.includes('it_IT'))
    })

    it('restituisce un array non vuoto', () => {
      assert.ok(getSupportedLocales().length > 0)
    })
  })
})
