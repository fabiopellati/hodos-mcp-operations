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

## Configurazione dello stack

Il server si avvia con Docker Compose. Il file
`docker-compose.yml` prevede un servizio principale
`hodos-mcp` e servizi opzionali attivabili tramite
profili.

Avvio base (solo server MCP):

```bash
docker compose up -d
```

Il server espone la porta 3100 e richiede il
mount del volume dell'opera su `/opera`.

Variabili d'ambiente principali:
- `OPERA_ROOT` — path interno del volume opera
  (default: `/opera`)
- `OPERA_PATH` — path dell'opera sull'host
  (usato nel compose per il bind mount)
- `MCP_PORT` — porta esposta sull'host
  (default: `3100`)

## Opzione RAG

Il server supporta un modulo RAG opzionale per la
ricerca semantica nei contenuti dell'opera. Il RAG
indicizza le entità logiche (questioni, entry del
mastro, note, RFC, documenti) e permette di cercare
per significato, non solo per ID o posizione.

### Attivazione

L'infrastruttura RAG si attiva con il profilo Docker
Compose `rag`, che aggiunge i servizi Qdrant (vector
database) e Redis (cache):

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
