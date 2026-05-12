import { spawn } from 'node:child_process'

// A-02: proteggi le righe di tabella markdown prima del wrap pandoc.
// Le righe di tabella sono sintatticamente atomiche e non devono essere spezzate.
function protectTableLines(text: string): { guarded: string; lines: string[] } {
  const lines: string[] = []
  const guarded = text.replace(/^(\|[^\n]*)$/gm, (match) => {
    const idx = lines.length
    lines.push(match)
    return `XTABLE${idx}XEND`
  })
  return { guarded, lines }
}

function restoreTableLines(text: string, lines: string[]): string {
  return text.replace(/XTABLE(\d+)XEND/g, (_, idx) => lines[parseInt(idx)])
}

// Garantisce una riga vuota prima di ogni marcatore di lista (ordinata o non
// ordinata) solo quando precede testo non strutturato come lista, evitando
// di inserire righe vuote tra voci consecutive dello stesso elenco.
// Usa un approccio riga per riga con tracciamento dello stato corrente.
function ensureBlankLineBeforeLists(text: string): string {
  const listMarker = /^(\d+\. |[*-] )/
  const continuation = /^[ \t]/

  const inputLines = text.split('\n')
  const result: string[] = []
  let inListItem = false

  for (const curr of inputLines) {
    const prev = result.length > 0 ? result[result.length - 1] : ''
    const prevIsEmpty = prev === ''

    if (curr === '') {
      inListItem = false
      result.push(curr)
      continue
    }

    if (listMarker.test(curr)) {
      if (!inListItem && !prevIsEmpty) {
        result.push('')
      }
      inListItem = true
      result.push(curr)
      continue
    }

    if (continuation.test(curr) && inListItem) {
      result.push(curr)
      continue
    }

    inListItem = false
    result.push(curr)
  }

  return result.join('\n')
}

// Ripristina i trattini em Unicode che pandoc converte nella sequenza " --- "
// quando processa testo con l'estensione smart. Il pattern " --- " circondato da
// spazi è univocamente un em dash in contesto inline; un thematic break pandoc
// lo emette a inizio riga senza spazi precedenti.
function restoreEmDash(text: string): string {
  return text.replace(/ --- /g, ' — ')
}

// A-06: rimuovi escape non necessari prodotti da pandoc commonmark_x.
// Pandoc escapa caratteri ASCII non significativi in contesto testuale.
function removeUnnecessaryEscapes(text: string): string {
  // De-escape \### quando non è a inizio riga
  let result = text.replace(/([^\n])\\(#+)/g, '$1$2')
  // De-escape \->
  result = result.replace(/-\\>/g, '->')
  return result
}

export function pandocNormalize(
  text: string,
  columns: number = 80
): Promise<string> {
  return new Promise((resolve) => {
    const { guarded: afterTable, lines: tableLines } = protectTableLines(text)
    const guardedText = ensureBlankLineBeforeLists(afterTable)

    const proc = spawn('pandoc', [
      '--wrap=auto',
      `--columns=${columns}`,
      '-f', 'markdown',
      '-t', 'commonmark_x-smart'
    ], { timeout: 10000 })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        console.warn('Pandoc errore:', stderr || `exit code ${code}`)
        resolve(text)
        return
      }
      const restored = restoreTableLines(stdout, tableLines)
      resolve(removeUnnecessaryEscapes(restoreEmDash(restored)))
    })

    proc.on('error', (err) => {
      console.warn('Pandoc non disponibile:', err.message)
      resolve(text)
    })

    proc.stdin.write(guardedText)
    proc.stdin.end()
  })
}

// Normalizza un testo destinato a essere usato come titolo heading.
// Passa il testo a pandoc con il prefisso ## in modo che pandoc riconosca
// il contesto e non applichi il wrap. Rimuove il prefisso e gli anchor
// auto-generati dal risultato.
export function pandocNormalizeTitle(
  text: string,
  columns: number = 80
): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn('pandoc', [
      '--wrap=auto',
      `--columns=${columns}`,
      '-f', 'markdown',
      '-t', 'commonmark_x-smart'
    ], { timeout: 10000 })

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (data: Buffer) => { stdout += data.toString() })
    proc.stderr.on('data', (data: Buffer) => { stderr += data.toString() })

    proc.on('close', (code) => {
      if (code !== 0) {
        console.warn('Pandoc errore (title):', stderr || `exit code ${code}`)
        resolve(text)
        return
      }
      let result = stdout.trim()
      if (result.startsWith('## ')) result = result.slice(3)
      result = result.replace(/ \{#[^}]+\}$/, '')
      resolve(result)
    })

    proc.on('error', (err) => {
      console.warn('Pandoc non disponibile:', err.message)
      resolve(text)
    })

    proc.stdin.write(`## ${text}`)
    proc.stdin.end()
  })
}
