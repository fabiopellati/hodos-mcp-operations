// Rimozione caratteri emoji Unicode
// Esclude cifre (0-9) e caratteri ASCII base che hanno
// la property Emoji ma non sono emoji decorativi

const EMOJI_PATTERN = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu

export function removeEmoji(text: string): string {
  return text.replace(EMOJI_PATTERN, '').replace(/  +/g, ' ')
}
