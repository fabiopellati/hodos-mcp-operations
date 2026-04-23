.PHONY: install build dev typecheck clean up down up-rag down-rag down-rag-clean

install: ## Installa dipendenze via container
	docker compose --profile dev run --rm dev -c "npm install"

build: ## Compila TypeScript via container
	docker compose --profile dev run --rm dev -c "npx tsc"

typecheck: ## Verifica tipi senza emettere output
	docker compose --profile dev run --rm dev -c "npx tsc --noEmit"

dev: ## Avvia server in modalita' sviluppo
	docker compose --profile dev run --rm --service-ports -p 3100:3100 dev -c "npx tsx src/index.ts"

clean: ## Rimuove artefatti di build
	rm -rf dist

up: ## Avvia server di produzione
	docker compose up -d hodos-mcp

down: ## Ferma server di produzione
	docker compose down

up-rag: ## Avvia server con Qdrant e Redis
	docker compose --profile rag up -d

down-rag: ## Ferma server e servizi RAG (preserva volumi)
	docker compose --profile rag down

down-rag-clean: ## Ferma server e servizi RAG (rimuove volumi)
	docker compose --profile rag down -v
