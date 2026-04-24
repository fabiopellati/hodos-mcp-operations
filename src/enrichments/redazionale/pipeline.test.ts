import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { fixAccenti } from './transforms/accenti.js'
import { removeEmoji } from './transforms/emoji.js'
import { pandocNormalize } from './transforms/pandoc.js'

// Test di integrazione della pipeline completa.
// La pipeline reale dipende dal server (isRedazionaleActive),
// quindi testiamo la composizione manuale delle trasformazioni
// nello stesso ordine della pipeline: emoji -> accenti -> pandoc.

describe('pipeline integrazione', () => {
  it('applica la catena completa: emoji + accenti + pandoc', async () => {
    const input = 'Questo e\' un testo \u{1F600} che contiene emoji e apostrofi ' +
      'che devono essere corretti perche\' il sistema deve produrre testo conforme ' +
      'alle direttive redazionali stabilite nel design del progetto.'

    // Step 1: rimozione emoji
    let result = removeEmoji(input)
    assert.ok(!result.includes('\u{1F600}'))

    // Step 2: accenti
    result = fixAccenti(result)
    assert.ok(result.includes('è'))
    assert.ok(result.includes('perché'))
    assert.ok(!result.includes("e'"))
    assert.ok(!result.includes("perche'"))

    // Step 3: pandoc
    result = await pandocNormalize(result, 80)
    const lines = result.trim().split('\n')
    for (const line of lines) {
      assert.ok(line.length <= 82, `Riga troppo lunga: ${line.length}`)
    }
    // Verifica che accenti e contenuto siano preservati
    assert.ok(result.includes('è'))
    assert.ok(result.includes('perché'))
  })

  it('preserva codice inline attraverso la catena', async () => {
    const input = "usa `e'` come esempio e poi e' corretto"
    let result = fixAccenti(input)
    result = await pandocNormalize(result, 80)
    assert.ok(result.includes("`e'`"))
    assert.ok(result.includes('è corretto'))
  })

  it('preserva blocchi di codice attraverso la catena', async () => {
    const input = "testo e' qui\n\n```\ne' codice\nperche' resta\n```\n\ntesto e' fuori"
    let result = fixAccenti(input)
    result = await pandocNormalize(result, 80)
    assert.ok(result.includes("e' codice"))
    assert.ok(result.includes("perche' resta"))
    assert.ok(result.includes('è qui'))
    assert.ok(result.includes('è fuori'))
  })

  it('gestisce testo vuoto', async () => {
    let result = removeEmoji('')
    result = fixAccenti(result)
    result = await pandocNormalize(result, 80)
    assert.equal(result.trim(), '')
  })

  it('gestisce testo senza trasformazioni necessarie', async () => {
    const input = 'Testo già conforme senza problemi.'
    let result = removeEmoji(input)
    result = fixAccenti(result)
    result = await pandocNormalize(result, 80)
    assert.ok(result.includes('Testo già conforme'))
  })
})
