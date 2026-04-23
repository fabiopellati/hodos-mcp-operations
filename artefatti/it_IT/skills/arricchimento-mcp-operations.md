---
skill: arricchimento-mcp-operations
client: Claude Code CLI
invocazione: /hodos-arricchimento-mcp-operations
tipo: descrittivo
locale: it_IT
---

# Arricchimento — mcp-operations

Il server mcp-operations è un server MCP (Model Context
Protocol) che fornisce all'agente AI tool per operare
sui file di processo di un'opera Hodos: questioni,
mastro, note, RFC e documenti di fase.

## Quando abilitarlo

L'arricchimento mcp-operations si abilita quando
l'opera Hodos richiede operazioni automatizzate sui
file di processo tramite un agente AI che comunica
via MCP.

Prerequisiti:
- Docker e Docker Compose installati sull'host
- L'opera deve avere i file di processo inizializzati
  (questioni.md, mastro.md, notes.md)

## Immagine Docker

L'immagine del server è pubblicata su GitHub
Container Registry:

```
ghcr.io/fabiopellati/hodos-mcp-operations
```

Il tag `latest` punta sempre all'ultimo rilascio.
Per fissare una versione specifica usare il tag
numerico (es. `0.4.0`).

## Configurazione dello stack

Il server si avvia con Docker Compose. Nella
directory dell'opera creare un file
`docker-compose.yml` con il seguente contenuto:

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

La variabile `OPERA_PATH` indica il path assoluto
della directory dell'opera sull'host. Se il file
`docker-compose.yml` si trova nella stessa directory
dell'opera, il default (`.`) è sufficiente.

Avvio del server:

```bash
docker compose up -d
```

Verifica che il server sia in esecuzione:

```bash
curl -s http://localhost:3100/health
```

### Variabili d'ambiente

- `OPERA_ROOT` — path interno del volume opera
  (default: `/opera`)
- `OPERA_PATH` — path dell'opera sull'host
  (usato nel compose per il bind mount)
- `MCP_PORT` — porta esposta sull'host
  (default: `3100`)

## Configurazione del client MCP

Per collegare Claude Code al server, creare o
aggiornare il file `.mcp.json` nella directory
dell'opera con la seguente configurazione:

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

Il nome `hodos-mcp-operations` è convenzionale; il
campo rilevante è l'URL che punta all'endpoint MCP
del server sulla porta configurata.

Dopo aver configurato il client, riavviare la
sessione Claude Code perché la connessione MCP
venga stabilita.

## Primo utilizzo

Alla prima interazione nella sessione, l'agente AI
deve chiamare il tool `configure` per dichiarare
gli arricchimenti attivi nell'opera. Il tool
restituisce il fingerprint dell'opera e abilita i
tool condizionati.

Esempio di chiamata:

```json
{ "arricchimenti": ["fasi-p0-p4", "rag"] }
```

La lista degli arricchimenti deve corrispondere a
quelli dichiarati nel `CLAUDE.md` dell'opera nella
sezione `Arricchimenti abilitati`. Se l'opera non
usa arricchimenti condizionati, passare una lista
vuota.

## Opzione RAG

Il server supporta un modulo RAG opzionale per la
ricerca semantica nei contenuti dell'opera. Il RAG
indicizza le entità logiche (questioni, entry del
mastro, note, RFC, documenti) e permette di cercare
per significato, non solo per ID o posizione.

### Attivazione

L'infrastruttura RAG si attiva con il profilo Docker
Compose `rag`. Il compose deve includere i servizi
Qdrant e Redis oltre al server principale:

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
      - QDRANT_HOST=qdrant
      - QDRANT_PORT=6333
      - REDIS_HOST=redis
      - REDIS_PORT=6379

  qdrant:
    image: qdrant/qdrant:v1.14.0
    ports:
      - "${QDRANT_PORT:-6333}:6333"
    volumes:
      - qdrant_data:/qdrant/storage
    profiles:
      - rag

  redis:
    image: redis:7-alpine
    ports:
      - "${REDIS_PORT:-6379}:6379"
    volumes:
      - redis_data:/data
    profiles:
      - rag

volumes:
  qdrant_data:
  redis_data:
```

Avvio con profilo RAG:

```bash
docker compose --profile rag up -d
```

Dopo l'avvio, il tool `configure` va chiamato con
l'arricchimento `rag` nella lista:

```json
{ "arricchimenti": ["rag"] }
```

Il server si connette a Qdrant, carica il modello
di embedding multilingua, e sincronizza l'indice con
lo stato corrente dell'opera. La sync è git-aware:
al primo avvio indicizza tutto, nelle sessioni
successive solo i file modificati dall'ultimo commit
indicizzato.

### Variabili d'ambiente RAG

- `QDRANT_HOST` — hostname del servizio Qdrant
  (default: `localhost`)
- `QDRANT_PORT` — porta Qdrant
  (default: `6333`)
- `REDIS_HOST` — hostname del servizio Redis
  (default: `localhost`)
- `REDIS_PORT` — porta Redis
  (default: `6379`)

### Persistenza

I volumi `qdrant_data` e `redis_data` sono managed
di default. I dati persistono tra riavvii normali
(`docker compose --profile rag down`). Per rimuovere
i volumi e forzare una reindicizzazione completa:

```bash
docker compose --profile rag down -v
```

Per domini di lunga durata che richiedono persistenza
esplicita, i volumi possono essere dichiarati come
`external: true` in un file compose override.

## Catalogo tool

### Tool base (sempre visibili)

- `configure` — configura arricchimenti attivi,
  restituisce fingerprint dell'opera
- `read_questione` — legge una questione per ID
- `list_questioni` — elenca questioni con filtro
  per stato
- `open_questione` — apre una nuova questione
- `update_questione_stato` — aggiorna stato di una
  questione
- `add_domanda` — aggiunge domanda aperta a una
  questione
- `check_item` — spunta un item (domanda o checkbox)
- `annotate_item` — annota un item con risposta
- `add_commento` — aggiunge commento a una questione
- `close_questione` — chiusura atomica cross-file
  (mastro + rimozione da questioni)
- `read_mastro` — legge il mastro completo o una
  entry per ID
- `write_mastro_entry` — scrive una nuova entry nel
  mastro
- `read_notes` — legge le note
- `write_nota` — aggiunge una nota
- `read_rfc` — legge una RFC per nome file
- `list_rfc` — elenca le RFC presenti
- `create_rfc` — crea una nuova RFC
- `update_rfc_sezione` — aggiorna una sezione della
  RFC
- `write_rfc_response` — compila la sezione Response

### Tool condizionati (arricchimento fasi-p0-p4)

- `read_documento` — legge un documento di fase
- `write_documento` — crea o aggiorna un documento
  di fase
- `create_unita` — crea la struttura di una nuova
  unità P2
- `read_attivita` — legge le voci di attività di
  una unità
- `write_attivita` — aggiunge o aggiorna una voce
  di attività

### Tool condizionati (arricchimento rag)

- `search_opera` — ricerca semantica nei contenuti
  dell'opera. Accetta query testuale, limite risultati
  e filtro opzionale per tipo di entità (questione,
  mastro-entry, nota, rfc, documento)
