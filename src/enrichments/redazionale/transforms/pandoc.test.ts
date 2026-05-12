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

  // Regressione Anomalia 1 (RFC Q001): bullet con ID bold e continuazione
  // a 2 spazi non deve produrre prima riga lunga e continuazione a colonna 0.
  it('preserva rientro di continuazione a 2 spazi nei bullet con ID bold', async () => {
    const input =
      '- **OBT-001** — Esporre i domini di business di General Cavi ' +
      '(produzione,\n' +
      '  inventario, vendite, spedizioni, pianificazione) tramite ' +
      "un'API GraphQL\n" +
      '  unificata, tipizzata e navigabile tramite introspezione.'
    const result = await pandocNormalize(input, 80)
    const lines = result.trim().split('\n')
    for (const line of lines) {
      assert.ok(line.length <= 82, `Riga troppo lunga (${line.length} chars): ${line}`)
    }
    const continuationLines = lines.slice(1)
    for (const line of continuationLines) {
      assert.ok(
        line === '' || line.startsWith('  '),
        `Riga di continuazione a colonna 0 invece di 2 spazi: "${line}"`
      )
    }
  })

  // Regressione Anomalia 1: bullet lungo su singola riga (non ancora wrappato)
  // deve essere wrappato a 80 colonne con continuazione a 2 spazi.
  it('wrappa bullet lungo su singola riga con continuazione a 2 spazi', async () => {
    const input =
      "- **OBT-001** — Esporre i domini di business di General Cavi (produzione, inventario, vendite, spedizioni, pianificazione) tramite un'API GraphQL unificata, tipizzata e navigabile tramite introspezione."
    const result = await pandocNormalize(input, 80)
    const lines = result.trim().split('\n')
    for (const line of lines) {
      assert.ok(line.length <= 82, `Riga troppo lunga (${line.length} chars): ${line}`)
    }
    const continuationLines = lines.slice(1)
    for (const line of continuationLines) {
      assert.ok(
        line === '' || line.startsWith('  '),
        `Riga di continuazione a colonna 0 invece di 2 spazi: "${line}"`
      )
    }
  })

  // Regressione Anomalia 2 (RFC Q001): elenco compatto senza righe vuote
  // tra le voci non deve diventare loose list nel file prodotto.
  it('non converte elenco compatto in loose list', async () => {
    const input =
      '- FNZ-001 — Pezzature\n' +
      '- FNZ-002 — Ordini di produzione\n' +
      '- FNZ-003 — Pianificazione produzione'
    const result = await pandocNormalize(input, 80)
    assert.ok(
      !result.includes('\n\n'),
      `Elenco compatto convertito in loose list:\n${result}`
    )
  })

  // Regressione Anomalia 2: elenco compatto con item a ID bold
  // non deve diventare loose list.
  it('non converte elenco compatto con ID bold in loose list', async () => {
    const input =
      '- **OBT-001** — Prima voce breve.\n' +
      '- **OBT-002** — Seconda voce breve.\n' +
      '- **OBT-003** — Terza voce breve.'
    const result = await pandocNormalize(input, 80)
    assert.ok(
      !result.includes('\n\n'),
      `Elenco compatto con ID bold convertito in loose list:\n${result}`
    )
  })

  // Comportamento invariato: elenco compatto preceduto da paragrafo
  // riceve riga vuota di separazione, ma le voci restano compatte.
  it('aggiunge riga vuota solo tra paragrafo e inizio elenco', async () => {
    const input =
      'Testo introduttivo.\n' +
      '- prima voce\n' +
      '- seconda voce\n' +
      '- terza voce'
    const result = await pandocNormalize(input, 80)
    assert.ok(result.includes('Testo introduttivo.'), 'paragrafo mancante')
    assert.ok(result.includes('- prima voce'), 'prima voce mancante')
    const afterParagraph = result.slice(result.indexOf('Testo introduttivo.') + 'Testo introduttivo.'.length)
    const firstListLine = afterParagraph.indexOf('- prima voce')
    const between = afterParagraph.slice(0, firstListLine)
    assert.ok(between.includes('\n\n'), 'riga vuota mancante tra paragrafo e lista')
    const listPart = result.slice(result.indexOf('- prima voce'))
    assert.ok(
      !listPart.includes('\n\n'),
      `Righe vuote tra voci dell'elenco:\n${listPart}`
    )
  })
})
