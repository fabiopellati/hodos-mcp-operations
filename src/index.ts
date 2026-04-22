import { createServer as createHttpServer } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer } from './server.js'

const port = parseInt(process.env.PORT || '3100', 10)
const mcpServer = createServer()

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
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    })
    await mcpServer.connect(transport)
    await transport.handleRequest(req, res)
    return
  }

  // 404 per qualsiasi altra rotta
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not Found' }))
})

httpServer.listen(port, () => {
  console.log(`Server MCP avviato su porta ${port}`)
})
