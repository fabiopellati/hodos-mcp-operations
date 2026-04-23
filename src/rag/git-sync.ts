/**
 * Operazioni git per la sync incrementale.
 * Usa child_process.execFile per evitare shell injection.
 */

import { execFile } from 'node:child_process'
import { access } from 'node:fs/promises'
import { join } from 'node:path'

function exec(
  cmd: string,
  args: string[],
  cwd: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`git ${args[0]} fallito: ${stderr || err.message}`))
        return
      }
      resolve(stdout.trim())
    })
  })
}

export async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await access(join(dir, '.git'))
    return true
  } catch {
    return false
  }
}

export async function getCurrentHead(cwd: string): Promise<string> {
  return exec('git', ['rev-parse', 'HEAD'], cwd)
}

export async function getChangedFiles(
  cwd: string,
  fromCommit: string
): Promise<string[]> {
  const output = await exec(
    'git',
    ['diff', '--name-only', fromCommit, 'HEAD'],
    cwd
  )
  if (!output) return []
  return output.split('\n').filter(f => f.length > 0)
}
