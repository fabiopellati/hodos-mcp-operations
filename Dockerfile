FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

FROM node:22-alpine

LABEL org.opencontainers.image.title="hodos-mcp-operations"
LABEL org.opencontainers.image.description="Server MCP operativo per file di processo Hodos. Configurare user nel compose: user \${UID:-1000}:\${GID:-1000}"
LABEL org.opencontainers.image.source="https://github.com/fabiopellati/hodos-mcp-operations"

RUN apk add --no-cache wget git pandoc
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules/
COPY --from=deps /app/package.json ./
COPY --from=build /app/dist ./dist/

ENV PUID=1000
ENV PGID=1000
ENV OPERA_ROOT=/opera

USER 1000:1000
EXPOSE 3100
CMD ["node", "dist/index.js"]
