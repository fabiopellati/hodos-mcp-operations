import { readFile, writeFile } from 'node:fs/promises'
import { parseMarkdown } from '../parser/markdown.js'
import type { Root } from 'mdast'

/**
 * Trasformazione chirurgica: riceve la stringa originale e l'AST
 * (solo per navigazione), restituisce la stringa modificata.
 * L'AST non deve essere ri-serializzato: le modifiche avvengono
 * sulla stringa originale tramite inserimenti e sostituzioni puntuali.
 */
type StringTransform = (content: string, tree: Root) => string

export async function atomicFileOperation(
  filePath: string,
  transform: StringTransform
): Promise<void> {
  const content = await readFile(filePath, 'utf-8')
  const tree = parseMarkdown(content)
  const modified = transform(content, tree)
  await writeFile(filePath, modified, 'utf-8')
}

export async function readAndParse(filePath: string): Promise<Root> {
  const content = await readFile(filePath, 'utf-8')
  return parseMarkdown(content)
}

export async function readRaw(filePath: string): Promise<string> {
  return readFile(filePath, 'utf-8')
}

// --- Helper per operazioni chirurgiche sulle stringhe ---

/** Inserisce testo alla posizione indicata */
export function insertAt(
  content: string, offset: number, text: string
): string {
  return content.slice(0, offset) + text + content.slice(offset)
}

/** Sostituisce un intervallo [start, end) con nuovo testo */
export function replaceRange(
  content: string, start: number, end: number, text: string
): string {
  return content.slice(0, start) + text + content.slice(end)
}
