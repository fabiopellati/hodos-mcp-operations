import type { Root, Heading, Table, List, RootContent } from 'mdast'
import { toString } from 'mdast-util-to-string'

export function getHeadingText(node: Heading): string {
  return toString(node)
}

/** Offset di inizio e fine di un nodo nell'AST (dalla stringa originale) */
function nodeStart(node: RootContent): number {
  return node.position?.start.offset ?? 0
}

function nodeEnd(node: RootContent): number {
  return node.position?.end.offset ?? 0
}

// --- Ricerca per heading ---

export interface SectionRange {
  /** Indice del nodo heading nell'array children */
  startIndex: number
  /** Indice del primo nodo DOPO la sezione */
  endIndex: number
  /** Offset nella stringa originale: inizio dell'heading */
  startOffset: number
  /** Offset nella stringa originale: fine della sezione
   *  (inizio del prossimo heading o fine file) */
  endOffset: number
}

export function findSectionByHeading(
  tree: Root,
  text: string,
  depth?: number
): SectionRange | null {
  const children = tree.children

  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (node.type !== 'heading') continue
    if (depth !== undefined && node.depth !== depth) continue
    if (getHeadingText(node) !== text) continue

    const sectionDepth = node.depth
    let endIndex = children.length
    for (let j = i + 1; j < children.length; j++) {
      const sibling = children[j]
      if (sibling.type === 'heading' && sibling.depth <= sectionDepth) {
        endIndex = j
        break
      }
    }

    return {
      startIndex: i,
      endIndex,
      startOffset: nodeStart(node),
      endOffset: endIndex < children.length
        ? nodeStart(children[endIndex])
        : tree.position?.end.offset ?? 0
    }
  }

  return null
}

// --- Ricerca blocco per ID (heading h2 → thematicBreak) ---

export interface BlockRange {
  startIndex: number
  endIndex: number
  startOffset: number
  /** Offset della fine del blocco (inizio del thematicBreak finale
   *  o fine file se non presente) */
  endOffset: number
}

/**
 * Trova un blocco che inizia con un heading h2 contenente l'ID
 * e termina al prossimo thematicBreak (escluso).
 */
export function findBlockByHeadingId(
  tree: Root,
  id: string
): BlockRange | null {
  const children = tree.children

  for (let i = 0; i < children.length; i++) {
    const node = children[i]
    if (node.type !== 'heading' || node.depth !== 2) continue
    if (!getHeadingText(node).includes(id)) continue

    let endIndex = children.length
    for (let j = i + 1; j < children.length; j++) {
      if (children[j].type === 'thematicBreak') {
        endIndex = j
        break
      }
    }

    return {
      startIndex: i,
      endIndex,
      startOffset: nodeStart(node),
      endOffset: endIndex < children.length
        ? nodeStart(children[endIndex])
        : tree.position?.end.offset ?? 0
    }
  }

  return null
}

// --- Tabella indice (deprecata: sostituita da ListInfo) ---

export interface TableInfo {
  nodeIndex: number
  table: Table
  startOffset: number
  endOffset: number
}

export function findIndexTable(tree: Root): TableInfo | null {
  for (let i = 0; i < tree.children.length; i++) {
    const node = tree.children[i]
    if (node.type === 'table') {
      return {
        nodeIndex: i,
        table: node,
        startOffset: nodeStart(node),
        endOffset: nodeEnd(node)
      }
    }
  }
  return null
}

// --- Elenco indice ---

export interface ListInfo {
  nodeIndex: number
  list: List
  startOffset: number
  endOffset: number
}

export function findIndexList(tree: Root): ListInfo | null {
  for (let i = 0; i < tree.children.length; i++) {
    const node = tree.children[i]
    if (node.type === 'list') {
      return {
        nodeIndex: i,
        list: node,
        startOffset: nodeStart(node),
        endOffset: nodeEnd(node)
      }
    }
  }
  return null
}

/**
 * Restituisce l'offset per inserire un nuovo item in cima
 * all'elenco indice e un flag che indica se serve un \n prima
 * (quando l'elenco è vuoto).
 */
export function findFirstListItemOffset(
  listInfo: ListInfo
): { offset: number; needsNewline: boolean } {
  if (listInfo.list.children.length > 0) {
    return { offset: nodeStart(listInfo.list.children[0]), needsNewline: false }
  }
  return { offset: listInfo.endOffset, needsNewline: true }
}

// --- Posizioni di inserimento (restituiscono offset) ---

/**
 * Offset subito dopo il blockquote dei contatori
 * (posizione per inserire nuovi blocchi nel corpo).
 */
export function findBodyInsertOffset(tree: Root): number {
  const children = tree.children
  // Cerca il blockquote (contatori) e il thematicBreak che lo segue
  for (let i = 0; i < children.length; i++) {
    if (children[i].type === 'blockquote') {
      // Cerca il thematicBreak subito dopo
      for (let j = i + 1; j < children.length; j++) {
        if (children[j].type === 'thematicBreak') {
          // Inserisci DOPO il thematicBreak
          return nodeEnd(children[j])
        }
      }
      // Se non c'è thematicBreak, inserisci dopo il blockquote
      return nodeEnd(children[i])
    }
  }
  return tree.position?.end.offset ?? 0
}

/**
 * Offset subito dopo il titolo h1 (per il mastro).
 */
export function findAfterTitleOffset(tree: Root): number {
  for (const node of tree.children) {
    if (node.type === 'heading' && node.depth === 1) {
      return nodeEnd(node)
    }
  }
  return 0
}

/**
 * Offset di fine del primo thematicBreak dopo l'indice
 * (per i file con indice: posizione dopo il --- separatore).
 */
export function findAfterIndexSeparatorOffset(tree: Root): number {
  const listInfo = findIndexList(tree)
  const startNodeIndex = listInfo?.nodeIndex ?? null

  if (startNodeIndex === null) return tree.position?.end.offset ?? 0

  const children = tree.children
  for (let i = startNodeIndex + 1; i < children.length; i++) {
    if (children[i].type === 'thematicBreak') {
      return nodeEnd(children[i])
    }
  }
  return nodeEnd(children[startNodeIndex])
}

// --- Ricerca testo in blocchi ---

/**
 * Trova la prima riga della tabella (dopo l'header) come offset
 * per inserire una nuova riga in cima.
 */
/**
 * Restituisce l'offset per inserire una nuova riga in cima
 * alla tabella (dopo l'header) e un flag che indica se serve
 * un \n prima della riga (quando si inserisce alla fine della
 * tabella vuota, il \n della riga precedente non è incluso).
 */
export function findFirstDataRowOffset(
  table: Table
): { offset: number; needsNewline: boolean } {
  // La riga 0 è l'header. Se ci sono righe dati, inserisci
  // prima della prima riga dati.
  if (table.children.length > 1) {
    return { offset: nodeStart(table.children[1]), needsNewline: false }
  }
  // Tabella vuota: inserisci alla fine, ma serve \n
  return { offset: nodeEnd(table), needsNewline: true }
}

/**
 * Cerca un pattern testuale nella stringa e restituisce
 * offset di inizio e fine della riga che lo contiene.
 */
export function findLineByPattern(
  content: string,
  pattern: RegExp
): { lineStart: number; lineEnd: number; match: RegExpMatchArray } | null {
  const lines = content.split('\n')
  let offset = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = line.match(pattern)
    if (m) {
      // +1 per il \n, ma solo se non è l'ultima riga
      const hasNewline = offset + line.length < content.length
      return {
        lineStart: offset,
        lineEnd: offset + line.length + (hasNewline ? 1 : 0),
        match: m
      }
    }
    offset += line.length + 1
  }
  return null
}

/**
 * Cerca un pattern all'interno di un intervallo della stringa.
 */
export function findLineByPatternInRange(
  content: string,
  pattern: RegExp,
  rangeStart: number,
  rangeEnd: number
): { lineStart: number; lineEnd: number; match: RegExpMatchArray } | null {
  const slice = content.slice(rangeStart, rangeEnd)
  const result = findLineByPattern(slice, pattern)
  if (!result) return null
  return {
    lineStart: rangeStart + result.lineStart,
    lineEnd: rangeStart + result.lineEnd,
    match: result.match
  }
}

/**
 * Restituisce la posizione di fine dell'entry di lista che inizia
 * alla prima linea indicata da firstLineEnd, includendo le righe
 * di continuazione (indentate di 2 spazi) dell'item Markdown.
 *
 * firstLineEnd deve essere il lineEnd (incluso il \n) della prima
 * riga fisica dell'item. Il valore restituito è la posizione
 * immediatamente dopo l'ultima riga di continuazione (o
 * firstLineEnd stesso se non ce ne sono).
 */
export function findListEntryEnd(content: string, firstLineEnd: number): number {
  let pos = firstLineEnd
  while (pos < content.length) {
    const nextNewline = content.indexOf('\n', pos)
    const lineEnd = nextNewline === -1 ? content.length : nextNewline + 1
    const line = content.slice(pos, nextNewline === -1 ? content.length : nextNewline)
    if (line.startsWith('  ') && line.trim() !== '') {
      pos = lineEnd
    } else {
      break
    }
  }
  return pos
}

/**
 * Trova l'ultima occorrenza di un pattern in un intervallo.
 */
export function findLastLineByPatternInRange(
  content: string,
  pattern: RegExp,
  rangeStart: number,
  rangeEnd: number
): { lineStart: number; lineEnd: number; match: RegExpMatchArray } | null {
  const slice = content.slice(rangeStart, rangeEnd)
  const lines = slice.split('\n')
  let offset = 0
  let last: { lineStart: number; lineEnd: number; match: RegExpMatchArray } | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const m = line.match(pattern)
    if (m) {
      const hasNewline = rangeStart + offset + line.length < content.length
      last = {
        lineStart: rangeStart + offset,
        lineEnd: rangeStart + offset + line.length + (hasNewline ? 1 : 0),
        match: m
      }
    }
    offset += line.length + 1
  }
  return last
}
