import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { removeEmoji } from './emoji.js'

describe('removeEmoji', () => {
  it('restituisce testo senza emoji invariato', () => {
    assert.equal(removeEmoji('testo normale'), 'testo normale')
  })

  it('rimuove emoji faccina', () => {
    const result = removeEmoji('ciao \u{1F600} mondo')
    assert.ok(!result.includes('\u{1F600}'))
    assert.ok(result.includes('ciao'))
    assert.ok(result.includes('mondo'))
  })

  it('rimuove emoji oggetto', () => {
    const result = removeEmoji('file \u{1F4C4} documento')
    assert.ok(!result.includes('\u{1F4C4}'))
  })

  it('preserva cifre', () => {
    assert.equal(removeEmoji('valore 42'), 'valore 42')
  })

  it('preserva lettere accentate', () => {
    assert.equal(removeEmoji('perché è così'), 'perché è così')
  })

  it('preserva punteggiatura', () => {
    assert.equal(removeEmoji('a, b; c.'), 'a, b; c.')
  })
})
