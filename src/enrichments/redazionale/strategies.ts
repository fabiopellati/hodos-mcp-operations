export type LocaleDefaults = {
  'wrap-colonne': number
  accenti: boolean
  emoji: boolean
  'stile-discorsivo': boolean
  'tabelle-markdown': boolean
  'formato-data': string
  'formato-ora': string
  regole_persuasive: string[]
}

const IT_IT: LocaleDefaults = {
  'wrap-colonne': 80,
  accenti: true,
  emoji: false,
  'stile-discorsivo': true,
  'tabelle-markdown': false,
  'formato-data': 'd/m/Y',
  'formato-ora': 'H:i',
  regole_persuasive: [
    'Usare le proposizioni subordinate quando servono a chiarire relazioni tra concetti.',
    'Non comprimere il linguaggio con sintesi algoritmica che sacrifica la leggibilita per la concisione.',
    'Un periodo ben costruito di due righe e preferibile a una riga telegrafica che costringe il lettore a ricostruire i nessi logici.',
    'Gli elenchi vanno formulati come elenchi puntati o numerati, non come elementi separati da virgole dentro un periodo.',
    'Preferire elenchi nidificati alle tabelle markdown quando la struttura a griglia non e strettamente necessaria.'
  ]
}

const STRATEGIES: Record<string, LocaleDefaults> = {
  'it_IT': IT_IT
}

export function getStrategy(lingua: string): LocaleDefaults {
  const strategy = STRATEGIES[lingua]
  if (!strategy) {
    throw new Error(
      `Locale "${lingua}" non supportata. ` +
      `Locale disponibili: ${getSupportedLocales().join(', ')}`
    )
  }
  return strategy
}

export function getSupportedLocales(): string[] {
  return Object.keys(STRATEGIES)
}
