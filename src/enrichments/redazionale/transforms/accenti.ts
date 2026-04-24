// Sostituzione accenti italiani — logica derivata da fix-accenti.pl
// Accenti acuti: parole in -che', ne', se'
// Accenti gravi: tutti gli altri casi (e', a', i', o', u')

const ACUTI: [RegExp, string][] = [
  [/\bperche'/gi, 'perché'],
  [/\bpoiche'/gi, 'poiché'],
  [/\baffinche'/gi, 'affinché'],
  [/\bbenche'/gi, 'benché'],
  [/\bnonche'/gi, 'nonché'],
  [/\bfinche'/gi, 'finché'],
  [/\bcosicche'/gi, 'cosicché'],
  [/\bpurche'/gi, 'purché'],
  [/\bgiacche'/gi, 'giacché'],
  [/\bsicche'/gi, 'sicché'],
  [/\bne'(?=[^a-zA-ZÀ-ÿ]|$)/g, 'né'],
  [/\bse'(?=[^a-zA-ZÀ-ÿ]|$)/g, 'sé'],
]

const GRAVI: [RegExp, string][] = [
  [/(?<=[a-zA-ZÀ-ÿ])e'(?=[^a-zA-ZÀ-ÿ]|$)/g, 'è'],
  [/(?<=[a-zA-ZÀ-ÿ])a'(?=[^a-zA-ZÀ-ÿ]|$)/g, 'à'],
  [/(?<=[a-zA-ZÀ-ÿ])i'(?=[^a-zA-ZÀ-ÿ]|$)/g, 'ì'],
  [/(?<=[a-zA-ZÀ-ÿ])o'(?=[^a-zA-ZÀ-ÿ]|$)/g, 'ò'],
  [/(?<=[a-zA-ZÀ-ÿ])u'(?=[^a-zA-ZÀ-ÿ]|$)/g, 'ù'],
  // e' a inizio parola (es. "e' vero")
  [/\be'(?=[^a-zA-ZÀ-ÿ]|$)/g, 'è'],
]

// Apocopi da non trasformare
const APOCOPI = /\b(po|mo)'/gi

export function fixAccenti(text: string): string {
  // Proteggi blocchi di codice recintati
  const fenced: string[] = []
  let result = text.replace(/```[\s\S]*?```/g, (match) => {
    fenced.push(match)
    return `\x00FENCED${fenced.length - 1}\x00`
  })

  // Proteggi inline code
  const inlines: string[] = []
  result = result.replace(/`[^`]+`/g, (match) => {
    inlines.push(match)
    return `\x00INLINE${inlines.length - 1}\x00`
  })

  // Proteggi apocopi
  const apocopi: string[] = []
  result = result.replace(APOCOPI, (match) => {
    apocopi.push(match)
    return `\x00APOCOPE${apocopi.length - 1}\x00`
  })

  // Applica acuti prima dei gravi
  for (const [pattern, replacement] of ACUTI) {
    result = result.replace(pattern, replacement)
  }
  for (const [pattern, replacement] of GRAVI) {
    result = result.replace(pattern, replacement)
  }

  // Ripristina apocopi
  result = result.replace(/\x00APOCOPE(\d+)\x00/g, (_, i) => apocopi[parseInt(i)])

  // Ripristina inline code
  result = result.replace(/\x00INLINE(\d+)\x00/g, (_, i) => inlines[parseInt(i)])

  // Ripristina blocchi di codice
  result = result.replace(/\x00FENCED(\d+)\x00/g, (_, i) => fenced[parseInt(i)])

  return result
}
