import type { Root, Heading, Table } from 'mdast'
import { toString } from 'mdast-util-to-string'

export function getHeadingText(node: Heading): string {
  return toString(node)
}

/**
 * Trova una sezione identificata dal testo dell'heading e opzionalmente
 * dalla profondita'. Restituisce gli indici di inizio (l'heading) e fine
 * (esclusa) della sezione.
 */
export function findSectionByHeading(
  tree: Root,
  text: string,
  depth?: number
): { startIndex: number; endIndex: number } | null {
  const children = tree.children

  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (node.type !== 'heading') continue
    if (depth !== undefined && node.depth !== depth) continue
    if (getHeadingText(node) !== text) continue

    // Trova la fine della sezione: il prossimo heading con profondita'
    // uguale o inferiore
    const sectionDepth = node.depth
    let endIndex = children.length
    for (let j = i + 1; j < children.length; j++) {
      const sibling = children[j]
      if (sibling.type === 'heading' && sibling.depth <= sectionDepth) {
        endIndex = j
        break
      }
    }

    return { startIndex: i, endIndex }
  }

  return null
}

/**
 * Trova un blocco delimitato da thematicBreak il cui primo heading
 * contiene l'ID cercato. Il blocco inizia dal thematicBreak e termina
 * al thematicBreak successivo o alla fine del documento.
 */
export function findBlockById(
  tree: Root,
  id: string
): { startIndex: number; endIndex: number } | null {
  const children = tree.children

  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (node.type !== 'thematicBreak') continue

    // Cerca un heading subito dopo il thematicBreak che contenga l'ID
    const nextIndex = i + 1
    if (nextIndex >= children.length) continue

    const next = children[nextIndex]
    if (next.type !== 'heading') continue
    if (!getHeadingText(next).includes(id)) continue

    // Trova la fine del blocco: il prossimo thematicBreak
    let endIndex = children.length
    for (let j = nextIndex + 1; j < children.length; j++) {
      if (children[j].type === 'thematicBreak') {
        endIndex = j
        break
      }
    }

    return { startIndex: i, endIndex }
  }

  return null
}

/**
 * Trova la tabella indice nel documento (la prima tabella presente).
 */
export function findIndexTable(
  tree: Root
): { nodeIndex: number; table: Table } | null {
  for (let i = 0; i < tree.children.length; i++) {
    const node = tree.children[i]
    if (node.type === 'table') {
      return { nodeIndex: i, table: node }
    }
  }
  return null
}

/**
 * Trova il punto di inserimento dopo la tabella indice e il primo
 * thematicBreak che la segue.
 */
export function findInsertionPointAfterIndex(tree: Root): number {
  const indexTable = findIndexTable(tree)
  if (!indexTable) return tree.children.length

  // Cerca il primo thematicBreak dopo la tabella
  for (let i = indexTable.nodeIndex + 1; i < tree.children.length; i++) {
    if (tree.children[i].type === 'thematicBreak') {
      return i
    }
  }

  return indexTable.nodeIndex + 1
}

/**
 * Trova il punto di inserimento dopo il titolo h1 (per il mastro).
 */
export function findInsertionPointAfterTitle(tree: Root): number {
  for (let i = 0; i < tree.children.length; i++) {
    const node = tree.children[i]
    if (node.type === 'heading' && node.depth === 1) {
      return i + 1
    }
  }
  return 0
}
