---
tipo-artefatto: guida
documento: arricchimento-mcp-operations
descrizione: >-
  Guida all'arricchimento mcp-operations, server MCP
  per operazioni deterministiche sui file di processo
  Hodos. Contiene istruzioni per l'abilitazione,
  la configurazione Docker e del client MCP, e la
  descrizione del funzionamento operativo.
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

## Che cosa fa concretamente

Quando l'arricchimento è attivo, l'operatore lavora
esattamente come prima: chiede all'agente AI di
aprire questioni, aggiornare stati, scrivere nel
mastro. La differenza è che l'agente, invece di
editare direttamente i file markdown dell'opera,
chiama i tool esposti dal server MCP. Il server
esegue le modifiche applicando le regole del
protocollo come vincoli automatici: impedisce di
chiudere una questione senza l'entry nel mastro,
garantisce che il mastro sia prepend-only, valida
le transizioni di stato e mantiene coerente l'indice
delle questioni.

L'operatore non deve imparare comandi nuovi né
cambiare il proprio modo di interagire con l'agente.
L'unica differenza visibile è che l'agente invoca
tool MCP invece di usare tool di editing dei file,
e gli errori strutturali (stati non validi, entry
duplicate, sezioni mancanti) vengono intercettati
dal server prima che il file venga modificato.

---

## Quando è utile

L'arricchimento è utile nelle opere in cui l'agente
AI gestisce frequentemente i file di processo e si
vuole ridurre il rischio di errori strutturali. Le
operazioni più comuni che il server gestisce sono:

- Apertura, aggiornamento e chiusura di questioni
  con validazione automatica degli stati e
  aggiornamento coerente dell'indice
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

L'abilitazione richiede tre passaggi: la
dichiarazione nel CLAUDE.md dell'opera, l'avvio del
server Docker e la configurazione del client MCP.

### 1. Dichiarazione nel CLAUDE.md

Nel `CLAUDE.md` dell'opera, nella sezione
`Arricchimenti abilitati`, aggiungere:

```
- arricchimento-mcp-operations
```

### 2. Avvio del server

Il server richiede Docker e Docker Compose. Nella
directory dell'opera creare un file
`docker-compose.yml` con questa configurazione:

```yaml
services:
  hodos-mcp:
    image: ghcr.io/fabiopellati/hodos-mcp-operations:latest
    ports:
      - "${MCP_PORT:-3100}:3100"
    volumes:
      - "${OPERA_PATH:-.}:/opera"
    environment:
      - PORT=3100
      - OPERA_ROOT=/opera
```

Avviare il server:

```bash
docker compose up -d
```

Verificare che il server sia in esecuzione:

```bash
curl -s http://localhost:3100/health
```

Se il compose si trova in una directory diversa da
quella dell'opera, impostare la variabile
`OPERA_PATH` con il path assoluto dell'opera
sull'host.

### 3. Configurazione del client MCP

Per collegare Claude Code al server, creare il
file `.mcp.json` nella directory dell'opera:

```json
{
  "mcpServers": {
    "hodos-mcp-operations": {
      "type": "http",
      "url": "http://localhost:3100/mcp"
    }
  }
}
```

Riavviare la sessione Claude Code perché la
connessione MCP venga stabilita.

### 4. Configurazione iniziale nella sessione

Alla prima interazione, l'agente AI deve chiamare
il tool `configure` per dichiarare gli arricchimenti
attivi e ricevere il fingerprint dell'opera. Senza
questa chiamata i tool condizionati (fasi, RAG) non
sono disponibili.

Per i dettagli operativi sui tool disponibili, le
variabili d'ambiente e il modulo RAG, consultare lo
skill `arricchimento-mcp-operations` tramite il tool
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
