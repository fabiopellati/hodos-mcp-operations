// Nessun tool di scrittura diretta sul mastro.
// L'unica operazione che scrive nel mastro è close_questione
// (src/tools/questioni/close.ts), che garantisce l'atomicità
// tra scrittura dell'entry e rimozione della questione.
//
// Il file è mantenuto vuoto per coerenza con la struttura
// del modulo mastro (read.ts + write.ts).

export function registerMastroWriteTools(): void {
  // Nessun tool da registrare
}
