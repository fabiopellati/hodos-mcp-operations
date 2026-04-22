import { readFile, writeFile } from 'node:fs/promises'
import { parseMarkdown, stringifyMarkdown } from '../parser/markdown.js'
import type { Root } from 'mdast'

type AstTransform = (tree: Root) => Root

export async function atomicFileOperation(
  filePath: string,
  transform: AstTransform
): Promise<void> {
  const content = await readFile(filePath, 'utf-8')
  const tree = parseMarkdown(content)
  const modified = transform(tree)
  const output = stringifyMarkdown(modified)
  await writeFile(filePath, output, 'utf-8')
}

export async function readAndParse(filePath: string): Promise<Root> {
  const content = await readFile(filePath, 'utf-8')
  return parseMarkdown(content)
}
