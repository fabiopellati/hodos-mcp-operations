---
tipo-artefatto: guida
documento: arricchimento-mcp-operations
descrizione: >-
  Guida all'arricchimento mcp-operations, server MCP
  per operazioni deterministiche sui file di processo
  Hodos
autorita: informativa
---

# Arricchimento — mcp-operations

L'arricchimento mcp-operations aggiunge a un'opera
Hodos un server MCP (Model Context Protocol) che
espone tool per operare sui file di processo in modo
deterministico e strutturato. L'agente AI, invece di
leggere e scrivere direttamente i file markdown, usa
i tool del server per aprire questioni, aggiornare
stati, scrivere nel mastro, gestire note e RFC.

Questo arricchimento è opzionale. Un'opera Hodos
funziona correttamente anche senza di esso, con
l'agente che opera sui file tramite gli skill del
protocollo base. L'arricchimento mcp-operations
sostituisce le operazioni manuali sui file con
chiamate a tool che garantiscono atomicità, coerenza
strutturale e validazione automatica.

---

## Quando è utile

L'arricchimento è utile nelle opere in cui l'agente AI
gestisce frequentemente i file di processo e si vuole
ridurre il rischio di errori strutturali. Le operazioni
più comuni che il server gestisce sono:

- Apertura, aggiornamento e chiusura di questioni con
  validazione automatica degli stati e aggiornamento
  coerente dell'indice
- Scrittura di entry nel mastro con garanzia di
  prepend-only e immutabilità
- Gestione di note con numerazione automatica
- Creazione e aggiornamento di RFC con verifica di
  integrità della sezione di richiesta
- Chiusura atomica cross-file (mastro + rimozione
  dalla questione in un'unica operazione)

Il server supporta anche un modulo RAG opzionale per
la ricerca semantica nei contenuti dell'opera.

---

## Come si abilita

Nel `CLAUDE.md` dell'opera, nella sezione
`Arricchimenti abilitati`, aggiungere:

```
- arricchimento-mcp-operations
```

Il server richiede Docker e Docker Compose. Si avvia
con:

```bash
docker compose up -d
```

La configurazione prevede il mount del volume
dell'opera sulla directory `/opera` del container e
l'esposizione della porta MCP (default 3100).

Per i dettagli operativi sulla configurazione, i tool
disponibili e il modulo RAG, consultare lo skill
`arricchimento-mcp-operations` tramite il tool
`get_skill`.

---

## Rapporto con il protocollo base

L'arricchimento non modifica il protocollo Hodos: le
regole su stati, approvazioni, immutabilità del mastro
e ciclo delle questioni restano invariate. Il server
applica queste regole come vincoli nei propri tool,
impedendo ad esempio di chiudere una questione senza
scrivere l'entry nel mastro o di modificare un'entry
già scritta.

Le operazioni esposte dal server corrispondono
esattamente a quelle descritte negli skill del
protocollo base (questione, rfc, nota). La differenza
è nel mezzo: invece di editare file markdown, l'agente
chiama un tool che produce lo stesso risultato con
garanzie strutturali aggiuntive.
