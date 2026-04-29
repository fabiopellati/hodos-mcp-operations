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
    const { guarded: guardedText, lines: tableLines } = protectTableLines(text)

    const proc = spawn('pandoc', [
      '--wrap=auto',
      `--columns=${columns}`,
      '-f', 'markdown',
      '-t', 'commonmark_x'
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
      resolve(removeUnnecessaryEscapes(restored))
    })

    proc.on('error', (err) => {
      console.warn('Pandoc non disponibile:', err.message)
      resolve(text)
    })

    proc.stdin.write(guardedText)
    proc.stdin.end()
  })
}
