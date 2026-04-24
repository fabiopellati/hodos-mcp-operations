import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fixAccenti } from './accenti.js'

describe('fixAccenti', () => {
  describe('accenti acuti (-che)', () => {
    it('converte perche\' in perché', () => {
      assert.equal(fixAccenti("perche'"), 'perché')
    })
    it('converte poiche\' in poiché', () => {
      assert.equal(fixAccenti("poiche'"), 'poiché')
    })
    it('converte affinche\' in affinché', () => {
      assert.equal(fixAccenti("affinche'"), 'affinché')
    })
    it('converte benche\' in benché', () => {
      assert.equal(fixAccenti("benche'"), 'benché')
    })
    it('converte nonche\' in nonché', () => {
      assert.equal(fixAccenti("nonche'"), 'nonché')
    })
    it('converte finche\' in finché', () => {
      assert.equal(fixAccenti("finche'"), 'finché')
    })
    it('converte cosicche\' in cosicché', () => {
      assert.equal(fixAccenti("cosicche'"), 'cosicché')
    })
    it('converte purche\' in purché', () => {
      assert.equal(fixAccenti("purche'"), 'purché')
    })
    it('converte giacche\' in giacché', () => {
      assert.equal(fixAccenti("giacche'"), 'giacché')
    })
    it('converte sicche\' in sicché', () => {
      assert.equal(fixAccenti("sicche'"), 'sicché')
    })
  })

  describe('accenti acuti (ne, se)', () => {
    it('converte ne\' in né', () => {
      assert.equal(fixAccenti("ne' l'uno ne' l'altro"), "né l'uno né l'altro")
    })
    it('converte se\' in sé', () => {
      assert.equal(fixAccenti("se' stesso"), 'sé stesso')
    })
  })

  describe('accenti gravi', () => {
    it('converte e\' in è', () => {
      assert.equal(fixAccenti("e' vero"), 'è vero')
    })
    it('converte a\' in à a fine parola', () => {
      assert.equal(fixAccenti("citta'"), 'città')
    })
    it('converte i\' in ì', () => {
      assert.equal(fixAccenti("cosi'"), 'così')
    })
    it('converte o\' in ò', () => {
      assert.equal(fixAccenti("pero'"), 'però')
    })
    it('converte u\' in ù', () => {
      assert.equal(fixAccenti("piu'"), 'più')
    })
  })

  describe('protezione apocopi', () => {
    it('preserva po\'', () => {
      assert.equal(fixAccenti("un po' di"), "un po' di")
    })
    it('preserva mo\'', () => {
      assert.equal(fixAccenti("mo'"), "mo'")
    })
  })

  describe('protezione codice', () => {
    it('non trasforma dentro blocchi recintati', () => {
      const input = "testo e' qui\n```\ne' codice\n```\ntesto e' fuori"
      const result = fixAccenti(input)
      assert.ok(result.includes("è qui"))
      assert.ok(result.includes("e' codice"))
      assert.ok(result.includes("è fuori"))
    })
    it('non trasforma dentro inline code', () => {
      const input = "testo e' qui e `e' codice` e poi e' fuori"
      const result = fixAccenti(input)
      assert.ok(result.includes("è qui"))
      assert.ok(result.includes("`e' codice`"))
      assert.ok(result.includes("è fuori"))
    })
  })

  describe('testo misto', () => {
    it('gestisce frase con accenti misti', () => {
      const input = "perche' e' cosi' difficile? un po' di piu'"
      const result = fixAccenti(input)
      assert.equal(result, "perché è così difficile? un po' di più")
    })
  })
})
