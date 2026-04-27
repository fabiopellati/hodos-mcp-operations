---
tipo-artefatto: skill
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
      - "./hodos-operations.yml:/opera/hodos-operations.yml"
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
- `HODOS_CONFIG_PATH` — path del file di
  configurazione dentro il container (default:
  `${OPERA_ROOT}/hodos-operations.yml`)

## Configurazione persistente

Il server supporta un file `hodos-operations.yml`
che dichiara gli arricchimenti attivi e i relativi
parametri. Il file viene letto all'avvio: gli
arricchimenti con `enabled: true` vengono
pre-attivati senza attendere la chiamata a
`configure`.

Creare il file nella directory dell'opera prima di
avviare il container:

```bash
touch hodos-operations.yml
```

### Struttura del file

```yaml
arricchimenti:
  fasi-p0-p4:
    enabled: true
  firma-utente:
    enabled: true
  compressione-mastro:
    enabled: false
  versionamento-git:
    enabled: true
  rag:
    enabled: false
  redazionale:
    enabled: true
    lingua: it_IT
    wrap-colonne: 80
    accenti: true
    emoji: false
    stile-discorsivo: true
    tabelle-markdown: false
    formato-data: Y-m-d
    formato-ora: H:i
```

Un arricchimento assente dal file equivale a
`enabled: false`. I parametri specifici di ogni
arricchimento hanno default sensati; se omessi,
il server usa i default.

### Arricchimenti disponibili

Gli arricchimenti configurabili nel file
`hodos-operations.yml` corrispondono in rapporto
1:1 agli arricchimenti del protocollo Hodos che il
server è in grado di gestire. L'elenco completo è
il seguente:

- `fasi-p0-p4` — abilita i tool per la gestione
  dei documenti di fase (P0-P4) e delle attività
  delle unità di realizzazione. Non accetta
  parametri oltre a `enabled`
- `firma-utente` — attiva la formattazione della
  firma dell'operatore nelle voci di storia, nei
  commenti e nelle note. La firma viene passata
  come parametro nei tool di scrittura quando
  l'arricchimento è attivo. Non accetta parametri
  oltre a `enabled`
- `compressione-mastro` — quando attivo, il campo
  Percorso nella chiusura delle questioni diventa
  opzionale anziché obbligatorio. Il percorso viene
  omesso dall'entry del mastro anche se fornito.
  Non accetta parametri oltre a `enabled`
- `versionamento-git` — dichiarato come
  arricchimento valido ma non ancora implementato
  nel codice del server. Può essere abilitato senza
  effetti collaterali; è riservato per future
  estensioni. Non accetta parametri oltre a
  `enabled`
- `rag` — abilita la ricerca semantica nei
  contenuti dell'opera tramite Qdrant e un modello
  di embedding multilingua. Richiede i servizi
  Qdrant e Redis (descritti nella sezione Opzione
  RAG). Non accetta parametri nel file di
  configurazione; le impostazioni di connessione
  sono gestite tramite variabili d'ambiente
- `redazionale` — fornisce direttive di
  formattazione del testo, con una pipeline di
  pre-processing automatico e direttive persuasive
  per l'agente. È l'unico arricchimento che accetta
  parametri specifici oltre a `enabled`, descritti
  nella sezione seguente

### Parametri dell'arricchimento redazionale

- `lingua` (obbligatorio) — locale nel formato
  `xx_YY` (es. `it_IT`). Determina la strategy
  di default per le direttive
- `wrap-colonne` — numero colonne per il wrap
  (default dalla strategy, es. 80 per it_IT;
  range ammesso: 40-120)
- `accenti` — sostituzione apostrofi con accenti
  (default: `true` per it_IT)
- `emoji` — se `false`, rimuove i caratteri emoji
  dal testo (default: `false` per it_IT)
- `stile-discorsivo` — direttiva persuasiva per
  stile con subordinate (default: `true` per it_IT)
- `tabelle-markdown` — se `false`, direttiva
  persuasiva che preferisce elenchi a tabelle
  (default: `false` per it_IT)
- `formato-data` — formato data con placeholder
  `Y` (anno), `m` (mese), `d` (giorno).
  Default per it_IT: `d/m/Y`
- `formato-ora` — formato ora con placeholder
  `H` (24h), `h` (12h), `i` (minuti), `s`
  (secondi), `A` (AM/PM).
  Default per it_IT: `H:i`

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

## Versione corrente

La versione corrente dell'arricchimento
mcp-operations documentata in questo skill è
**0.5.5**. Il tool `configure` restituisce la
versione del server nel campo `versione` della
risposta. Se la versione del server è inferiore a
quella documentata qui, alcune feature descritte in
questo documento potrebbero non essere disponibili.
In tal caso, segnalare all'operatore che il server
è obsoleto e suggerire l'aggiornamento:

```
Il server mcp-operations in esecuzione è alla
versione X.Y.Z, ma la documentazione descrive la
versione 0.5.5. Alcune feature potrebbero non
essere disponibili. Per aggiornare:

docker compose pull
docker compose up -d
```

### Compatibilità tra versioni

Il file `hodos-operations.yml` è compatibile in
avanti: se contiene arricchimenti non riconosciuti
dal server in esecuzione (perché introdotti in una
versione successiva), il server li ignora con un
warning in console senza interrompere l'avvio.
Questo consente di mantenere lo stesso file di
configurazione anche durante un downgrade
temporaneo del server.

La procedura di aggiornamento standard non
richiede migrazioni del file di configurazione:

```bash
docker compose pull
docker compose up -d
```

Non esiste al momento una matrice formale di
compatibilità versione server / versione skill.
Il criterio operativo è il seguente: se il tool
`configure` restituisce una versione inferiore a
quella documentata nello skill, i tool e i
parametri introdotti nelle versioni successive
potrebbero non essere disponibili, ma le
funzionalità preesistenti continuano a funzionare
senza modifiche.

## Primo utilizzo

Alla prima interazione nella sessione, l'agente AI
deve chiamare il tool `configure` per dichiarare
gli arricchimenti attivi nell'opera. Il tool
restituisce la versione del server, il fingerprint
dell'opera e abilita i tool condizionati.

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
      - "./hodos-operations.yml:/opera/hodos-operations.yml"
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

- `update_config` — modifica il file di configurazione
  hodos-operations.yml. Accetta un path puntato e un
  valore, persiste la modifica su disco e aggiorna
  la configurazione in memoria. Descritto in
  dettaglio nella sezione seguente

### Dettaglio del tool update_config

Il tool `update_config` consente di modificare il
file `hodos-operations.yml` dall'interno della
sessione MCP senza editare il file direttamente.

**Parametri**:
- `path` (stringa, obbligatorio) — percorso
  puntato nella struttura YAML, con segmenti
  separati da punto. Esempio:
  `arricchimenti.redazionale.enabled`
- `value` (stringa, numero o booleano,
  obbligatorio) — il nuovo valore da assegnare.
  Non sono ammessi array, oggetti, null o
  undefined

**Validazione**: il tool esegue tre controlli
prima di applicare la modifica:
- il path deve contenere almeno due segmenti
  (es. `arricchimenti.nome` è valido,
  `arricchimenti` da solo è rifiutato)
- il primo segmento deve essere `arricchimenti`
- il secondo segmento deve essere un nome di
  arricchimento valido (`fasi-p0-p4`,
  `firma-utente`, `compressione-mastro`,
  `versionamento-git`, `rag`, `redazionale`)

Il tool non valida i nomi delle proprietà
annidate né i tipi dei valori rispetto allo
schema dell'arricchimento. Se il path punta a
una struttura intermedia che non esiste, il tool
la crea automaticamente come oggetto vuoto.

**Sequenza di operazioni**: dopo la validazione
il tool carica il file di configurazione corrente
(o ne crea uno vuoto se non esiste), applica il
valore al path indicato, scrive il file su disco,
aggiorna la configurazione in memoria e ricalcola
la visibilità dei tool condizionati.

**Risposta**: il tool restituisce un oggetto con
tre campi:
- `messaggio` — conferma dell'operazione con
  path e valore applicato
- `arricchimenti_attivi` — elenco degli
  arricchimenti attualmente abilitati
- `configurazione` — la configurazione completa
  aggiornata

Esempio di utilizzo:

```json
{
  "path": "arricchimenti.redazionale.wrap-colonne",
  "value": 72
}
```

### Tool condizionati (arricchimento redazionale)

- `normalize_file` — normalizza un file markdown con
  Pandoc commonmark_x. Riprocessa l'intero file:
  altera il diff git. Usare solo su richiesta
  esplicita dell'operatore

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
