import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  documentiDir,
  processoDir,
  rfcDir,
  setLoadedPaths,
  listRoots,
  resolveOperaPath
} from './paths.js'

describe('paths', () => {
  beforeEach(() => {
    setLoadedPaths(undefined)
    delete process.env.OPERA_PROCESSO_DIR
    delete process.env.OPERA_RFC_DIR
    delete process.env.OPERA_DOCUMENTI_DIR
  })

  describe('default (operaRoot)', () => {
    it('processoDir cade su operaRoot quando non configurato', () => {
      assert.equal(processoDir(), '/opera')
    })

    it('rfcDir cade su processoDir/rfc', () => {
      assert.equal(rfcDir(), '/opera/rfc')
    })

    it('documentiDir cade su operaRoot/documenti', () => {
      assert.equal(documentiDir(), '/opera/documenti')
    })
  })

  describe('override via setLoadedPaths', () => {
    it('processoDir usa percorsi.governance se presente', () => {
      setLoadedPaths({ governance: '/governance' })
      assert.equal(processoDir(), '/governance')
    })

    it('rfcDir usa percorsi.rfc se presente', () => {
      setLoadedPaths({ rfc: '/rfc' })
      assert.equal(rfcDir(), '/rfc')
    })

    it('documentiDir usa percorsi.fasi se presente', () => {
      setLoadedPaths({ fasi: '/fasi' })
      assert.equal(documentiDir(), '/fasi')
    })

    it('mappa parziale: i non specificati cadono sui default', () => {
      setLoadedPaths({ fasi: '/fasi' })
      assert.equal(processoDir(), '/opera')
      assert.equal(documentiDir(), '/fasi')
      assert.equal(rfcDir(), '/opera/rfc')
    })
  })

  describe('listRoots', () => {
    it('elenca governance, rfc, fasi nell\'ordine fisso', () => {
      setLoadedPaths({
        governance: '/g',
        rfc: '/r',
        fasi: '/f'
      })
      const roots = listRoots()
      assert.deepEqual(
        roots.map(r => r.key),
        ['governance', 'rfc', 'fasi']
      )
      assert.equal(roots[0].path, '/g')
      assert.equal(roots[1].path, '/r')
      assert.equal(roots[2].path, '/f')
    })
  })

  describe('resolveOperaPath', () => {
    it('path assoluti sono ritornati invariati', () => {
      assert.equal(
        resolveOperaPath('/abs/path.md'),
        '/abs/path.md'
      )
    })

    it('prefisso documenti/ instrada su documentiDir', () => {
      setLoadedPaths({ fasi: '/fasi' })
      assert.equal(
        resolveOperaPath('documenti/definizione/1-obiettivi.md'),
        '/fasi/definizione/1-obiettivi.md'
      )
    })

    it('prefisso rfc/ instrada su rfcDir', () => {
      setLoadedPaths({ rfc: '/rfc' })
      assert.equal(
        resolveOperaPath('rfc/foo.md'),
        '/rfc/foo.md'
      )
    })

    it('senza prefisso noto, usa processoDir', () => {
      setLoadedPaths({ governance: '/g' })
      assert.equal(
        resolveOperaPath('questioni.md'),
        '/g/questioni.md'
      )
    })
  })
})
