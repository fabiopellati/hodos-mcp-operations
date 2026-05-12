import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { pandocNormalize } from './pandoc.js'

describe('pandocNormalize', () => {
  it('wrappa testo lungo a 80 colonne', async () => {
    const long = 'Questa e una frase molto lunga che dovrebbe essere wrappata ' +
      'perche supera il limite di ottanta caratteri configurato come default.'
    const result = await pandocNormalize(long, 80)
    const lines = result.trim().split('\n')
    for (const line of lines) {
      assert.ok(line.length <= 82, `Riga troppo lunga: ${line.length} chars`)
    }
  })

  it('wrappa a colonne personalizzate', async () => {
    const long = 'Questa e una frase che deve essere wrappata a quaranta colonne ' +
      'per verificare che il parametro funzioni.'
    const result = await pandocNormalize(long, 40)
    const lines = result.trim().split('\n')
    for (const line of lines) {
      assert.ok(line.length <= 42, `Riga troppo lunga: ${line.length} chars`)
    }
  })

  it('preserva blocchi di codice', async () => {
    const input = 'Testo prima.\n\n```\ncodice lungo che non deve essere wrappato indipendentemente dalla lunghezza\n```\n\nTesto dopo.'
    const result = await pandocNormalize(input, 40)
    assert.ok(result.includes('codice lungo che non deve essere wrappato'))
  })

  it('produce output commonmark_x', async () => {
    const input = '# Titolo\n\nParagrafo con **grassetto**.'
    const result = await pandocNormalize(input, 80)
    assert.ok(result.includes('# Titolo'))
    assert.ok(result.includes('**grassetto**'))
  })

  it('preserva elenchi non ordinati standalone', async () => {
    const input = '- primo\n- secondo\n- terzo'
    const result = await pandocNormalize(input, 80)
    assert.ok(result.includes('- primo'))
    assert.ok(result.includes('- secondo'))
    assert.ok(result.includes('- terzo'))
  })

  it('preserva elenco ordinato preceduto da paragrafo senza riga vuota', async () => {
    const input = '**Variazione**\n1. primo item\n2. secondo item\n3. terzo item'
    const result = await pandocNormalize(input, 80)
    assert.ok(result.includes('1.'), `output atteso con "1." ma ottenuto: ${result}`)
    assert.ok(result.includes('2.'), `output atteso con "2." ma ottenuto: ${result}`)
    assert.ok(result.includes('3.'), `output atteso con "3." ma ottenuto: ${result}`)
  })

  it('preserva em dash Unicode senza convertirlo in ---', async () => {
    const input = 'Testo con trattino em — e continuazione.'
    const result = await pandocNormalize(input, 80)
    assert.ok(result.includes('—'), `em dash atteso ma ottenuto: ${result}`)
    assert.ok(!result.includes('---'), `"---" non atteso ma presente in: ${result}`)
  })
})
