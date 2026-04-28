import { randomUUID } from 'node:crypto'
import { createServer as createHttpServer } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer, updateVisibility, setLoadedConfig } from './server.js'
import { loadConfigFile, getEnabledEnrichments } from './config/config-file.js'
import { setLoadedPaths } from './config/paths.js'

const port = parseInt(process.env.PORT || '3100', 10)

// Caricamento configurazione persistente all'avvio
const config = await loadConfigFile()
if (config) {
  setLoadedConfig(config)
  setLoadedPaths(config.percorsi)
  const enrichments = getEnabledEnrichments(config)
  if (enrichments.length > 0) {
    updateVisibility(enrichments)
    console.log(`Configurazione caricata: ${enrichments.join(', ')}`)
  }
}

// Stateful: un McpServer per sessione, con session ID
const sessions = new Map<string, StreamableHTTPServerTransport>()

const httpServer = createHttpServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${port}`)

  // Health check
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }

  // Endpoint MCP Streamable HTTP
  if (url.pathname === '/mcp') {
    // Nuova sessione: nessun session ID nell'header
    const sessionId = req.headers['mcp-session-id'] as string | undefined

    if (!sessionId) {
      // Prima richiesta (initialize): crea nuova sessione
      const mcpServer = createServer()
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID()
      })

      transport.onclose = () => {
        const sid = transport.sessionId
        if (sid) sessions.delete(sid)
      }

      await mcpServer.connect(transport)
      await transport.handleRequest(req, res)

      // Salva la sessione dopo l'initialize
      const sid = transport.sessionId
      if (sid) sessions.set(sid, transport)
      return
    }

    // Richiesta con session ID esistente
    const transport = sessions.get(sessionId)
    if (!transport) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Sessione non trovata' },
        id: null
      }))
      return
    }

    await transport.handleRequest(req, res)
    return
  }

  // DELETE per chiudere sessione
  if (req.method === 'DELETE' && url.pathname === '/mcp') {
    const sessionId = req.headers['mcp-session-id'] as string | undefined
    if (sessionId) {
      const transport = sessions.get(sessionId)
      if (transport) {
        await transport.close()
        sessions.delete(sessionId)
      }
    }
    res.writeHead(200)
    res.end()
    return
  }

  // 404 per qualsiasi altra rotta
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not Found' }))
})

httpServer.listen(port, () => {
  console.log(`Server MCP avviato su porta ${port}`)
})
