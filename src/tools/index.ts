import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerQuestioniReadTools } from './questioni/read.js'
import { registerQuestioniWriteTools } from './questioni/write.js'
import { registerCloseQuestioneTools } from './questioni/close.js'
import { registerMastroReadTools } from './mastro/read.js'
import { registerMastroWriteTools } from './mastro/write.js'
import { registerNotesReadTools } from './notes/read.js'
import { registerNotesWriteTools } from './notes/write.js'
import { registerRfcTools } from './rfc/index.js'
import { registerFasiTools } from './fasi/index.js'
import { registerRagTools } from './rag/search.js'

/**
 * Registra tutti i tool (base U2/U3 e condizionati U4)
 * nel registry interno del server.
 */
export function registerAllTools(_server: McpServer): void {
  // U2 — tool base (questioni, mastro, note)
  registerQuestioniReadTools()
  registerQuestioniWriteTools()
  registerCloseQuestioneTools()
  registerMastroReadTools()
  registerMastroWriteTools()
  registerNotesReadTools()
  registerNotesWriteTools()

  // U3 — tool RFC (base)
  registerRfcTools()

  // U4 — tool fasi P0-P4 (condizionati)
  registerFasiTools()

  // RAG — tool ricerca semantica (condizionato)
  registerRagTools()
}
