import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyDiffToManifest,
  buildManifestFromScan,
  diffScanWithManifest,
  type RagManifest,
  type ScannedFile
} from './manifest.js'

function file(
  logicalPath: string,
  hash: string,
  mtime: number = 1
): ScannedFile {
  return {
    absolutePath: `/abs/${logicalPath}`,
    logicalPath,
    hash,
    mtime
  }
}

describe('manifest', () => {
  describe('diffScanWithManifest', () => {
    it('manifest vuoto: tutti i file sono added', () => {
      const scan = [file('a.md', 'h1'), file('b.md', 'h2')]
      const manifest: RagManifest = { version: 1, files: {} }
      const diff = diffScanWithManifest(scan, manifest)
      assert.equal(diff.added.length, 2)
      assert.equal(diff.modified.length, 0)
      assert.equal(diff.removed.length, 0)
    })

    it('hash invariato: nessun delta', () => {
      const scan = [file('a.md', 'h1')]
      const manifest: RagManifest = {
        version: 1,
        files: { 'a.md': { hash: 'h1', mtime: 1 } }
      }
      const diff = diffScanWithManifest(scan, manifest)
      assert.equal(diff.added.length, 0)
      assert.equal(diff.modified.length, 0)
      assert.equal(diff.removed.length, 0)
    })

    it('hash cambiato: file in modified', () => {
      const scan = [file('a.md', 'h2')]
      const manifest: RagManifest = {
        version: 1,
        files: { 'a.md': { hash: 'h1', mtime: 1 } }
      }
      const diff = diffScanWithManifest(scan, manifest)
      assert.equal(diff.modified.length, 1)
      assert.equal(diff.modified[0].logicalPath, 'a.md')
    })

    it('file scomparso dal filesystem: in removed', () => {
      const scan: ScannedFile[] = []
      const manifest: RagManifest = {
        version: 1,
        files: { 'a.md': { hash: 'h1', mtime: 1 } }
      }
      const diff = diffScanWithManifest(scan, manifest)
      assert.deepEqual(diff.removed, ['a.md'])
    })

    it('combinazione: added, modified, removed coesistono', () => {
      const scan = [
        file('a.md', 'h1'),    // invariato
        file('b.md', 'hX'),    // modificato
        file('c.md', 'h3')     // nuovo
      ]
      const manifest: RagManifest = {
        version: 1,
        files: {
          'a.md': { hash: 'h1', mtime: 1 },
          'b.md': { hash: 'hOLD', mtime: 1 },
          'd.md': { hash: 'h4', mtime: 1 }
        }
      }
      const diff = diffScanWithManifest(scan, manifest)
      assert.deepEqual(
        diff.added.map(f => f.logicalPath),
        ['c.md']
      )
      assert.deepEqual(
        diff.modified.map(f => f.logicalPath),
        ['b.md']
      )
      assert.deepEqual(diff.removed, ['d.md'])
    })
  })

  describe('applyDiffToManifest', () => {
    it('applica added e modified, rimuove removed', () => {
      const manifest: RagManifest = {
        version: 1,
        files: {
          'old.md': { hash: 'hOLD', mtime: 1 }
        }
      }
      const updated = applyDiffToManifest(manifest, {
        added: [file('new.md', 'hNEW', 5)],
        modified: [],
        removed: ['old.md']
      })
      assert.deepEqual(Object.keys(updated.files).sort(), ['new.md'])
      assert.equal(updated.files['new.md'].hash, 'hNEW')
      assert.equal(updated.files['new.md'].mtime, 5)
    })

    it('non muta il manifest originale', () => {
      const manifest: RagManifest = {
        version: 1,
        files: { 'a.md': { hash: 'h1', mtime: 1 } }
      }
      applyDiffToManifest(manifest, {
        added: [file('b.md', 'h2')],
        modified: [],
        removed: []
      })
      assert.deepEqual(Object.keys(manifest.files), ['a.md'])
    })
  })

  describe('buildManifestFromScan', () => {
    it('costruisce un manifest fresco dallo scan', () => {
      const scan = [file('a.md', 'h1', 10), file('b.md', 'h2', 20)]
      const manifest = buildManifestFromScan(scan)
      assert.equal(manifest.version, 1)
      assert.deepEqual(manifest.files['a.md'], { hash: 'h1', mtime: 10 })
      assert.deepEqual(manifest.files['b.md'], { hash: 'h2', mtime: 20 })
    })
  })
})
