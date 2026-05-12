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

// Proteggi le righe di indice a elenco puntato prima del wrap pandoc.
// Le righe dell'indice Hodos (- **ID-NNN** — ...) devono restare su una
// singola riga fisica indipendentemente dalla loro lunghezza.
function protectIndexListLines(text: string): { guarded: string; lines: string[] } {
  const lines: string[] = []
  const guarded = text.replace(/^(- \*\*[A-Z]+-\d+\*\* — [^\n]*)$/gm, (match) => {
    const idx = lines.length
    lines.push(match)
    return `XLIST${idx}XEND`
  })
  return { guarded, lines }
}

function restoreIndexListLines(text: string, lines: string[]): string {
  return text.replace(/XLIST(\d+)XEND/g, (_, idx) => lines[parseInt(idx)])
}

// Garantisce una riga vuota prima di ogni marcatore di lista (ordinata o non
// ordinata) quando è preceduto da testo di paragrafo senza separatore.
// Senza questa pre-elaborazione pandoc può collassare gli item nel paragrafo
// precedente invece di riconoscerli come struttura di lista.
function ensureBlankLineBeforeLists(text: string): string {
  return text
    .replace(/([^\n])\n(\d+\. )/g, '$1\n\n$2')
    .replace(/([^\n])\n([-*] )/g, '$1\n\n$2')
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
    const { guarded: afterIndexList, lines: listLines } = protectIndexListLines(afterTable)
    const guardedText = ensureBlankLineBeforeLists(afterIndexList)

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
      const afterRestoreTable = restoreTableLines(stdout, tableLines)
      const restored = restoreIndexListLines(afterRestoreTable, listLines)
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
