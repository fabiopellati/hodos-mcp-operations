import { fixAccenti } from './transforms/accenti.js'
import { removeEmoji } from './transforms/emoji.js'
import { pandocNormalize } from './transforms/pandoc.js'
import { isRedazionaleActive, getDirectives } from './index.js'

export async function processText(text: string): Promise<string> {
  if (!isRedazionaleActive()) return text

  const directives = getDirectives()
  if (!directives) return text

  let result = text

  // 1. Rimozione emoji (se emoji: false)
  if (directives.direttive['emoji']?.valore === false) {
    result = removeEmoji(result)
  }

  // 2. Sostituzione accenti (se accenti: true)
  if (directives.direttive['accenti']?.valore === true) {
    result = fixAccenti(result)
  }

  // 3. Normalizzazione Pandoc (se wrap-colonne configurato)
  const wrapColonne = directives.direttive['wrap-colonne']?.valore as number | undefined
  if (wrapColonne) {
    result = await pandocNormalize(result, wrapColonne)
  }

  return result
}
