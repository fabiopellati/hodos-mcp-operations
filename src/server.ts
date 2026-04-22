import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z, type ZodType } from 'zod'
import { registerConfigureTool } from './configure.js'

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

export interface ToolRegistration {
  name: string
  description: string
  schema: ZodType
  handler: (params: unknown) => Promise<ToolResult>
  category: 'base' | 'conditional'
  requiredEnrichments: string[]
  visible: boolean
}

// Registry dei tool a livello di modulo
const toolRegistry = new Map<string, ToolRegistration>()
const activeEnrichments = new Set<string>()

export function registerTool(
  opts: Omit<ToolRegistration, 'visible'>
): void {
  const visible = opts.category === 'base'
  toolRegistry.set(opts.name, { ...opts, visible })
}

export function updateVisibility(enrichments: string[]): void {
  activeEnrichments.clear()
  for (const e of enrichments) {
    activeEnrichments.add(e)
  }

  for (const [, tool] of toolRegistry) {
    if (tool.category === 'base') {
      tool.visible = true
      continue
    }
    // Un tool condizionato e' visibile se tutti i suoi arricchimenti
    // richiesti sono attivi
    tool.visible = tool.requiredEnrichments.every(
      e => activeEnrichments.has(e)
    )
  }
}

export function getVisibleTools(): ToolRegistration[] {
  return Array.from(toolRegistry.values()).filter(t => t.visible)
}

export function getActiveEnrichments(): string[] {
  return Array.from(activeEnrichments)
}

/**
 * Crea e configura il server MCP con il tool configure registrato.
 */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'hodos-mcp-operations', version: '0.1.0' },
    { capabilities: { tools: {} } }
  )

  // Registra il tool configure nel registry interno
  registerConfigureTool()

  // Registra tutti i tool visibili sull'McpServer
  for (const tool of toolRegistry.values()) {
    const inputShape = tool.schema instanceof z.ZodObject
      ? (tool.schema as z.ZodObject<z.ZodRawShape>).shape
      : {}

    server.tool(
      tool.name,
      tool.description,
      inputShape,
      async (params) => {
        const result = await tool.handler(params)
        return result
      }
    )
  }

  return server
}
