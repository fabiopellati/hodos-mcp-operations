import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkStringify from 'remark-stringify'
import type { Root } from 'mdast'

const parser = unified()
  .use(remarkParse)
  .use(remarkGfm)

const stringifier = unified()
  .use(remarkStringify, {
    bullet: '-',
    listItemIndent: 'one',
    rule: '-'
  })
  .use(remarkGfm)

export function parseMarkdown(content: string): Root {
  return parser.parse(content)
}

export function stringifyMarkdown(tree: Root): string {
  return stringifier.stringify(tree)
}
