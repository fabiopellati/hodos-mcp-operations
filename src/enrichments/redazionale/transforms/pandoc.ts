import { spawn } from 'node:child_process'

export function pandocNormalize(
  text: string,
  columns: number = 80
): Promise<string> {
  return new Promise((resolve) => {
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
      resolve(stdout)
    })

    proc.on('error', (err) => {
      console.warn('Pandoc non disponibile:', err.message)
      resolve(text)
    })

    proc.stdin.write(text)
    proc.stdin.end()
  })
}
