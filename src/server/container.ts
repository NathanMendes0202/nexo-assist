import { agentConfigFromEnv, NexoAgent } from '../agent/nexo-agent';
import { createMastraLlm } from '../agent/mastra-llm';
import { openDatabase, type Db } from '../services/db';
import { ConversationStore } from '../services/conversations';
import { seedIfEmpty } from '../services/seed';
import { TicketService } from '../services/tickets/ticket-service';
import { UsageStore } from '../services/usage';
import { createAbuseGuard, type AbuseGuard } from './abuse';

interface Container {
  db: Db;
  tickets: TicketService;
  conversations: ConversationStore;
  agent: NexoAgent;
  config: ReturnType<typeof agentConfigFromEnv>;
  guard: AbuseGuard;
}

const globalForNexo = globalThis as unknown as { __nexo?: Container };

export function getContainer(): Container {
  if (!globalForNexo.__nexo) {
    const db = openDatabase();
    seedIfEmpty(db);
    const conversations = new ConversationStore(db);
    const tickets = new TicketService(db, { unavailableRate: Number(process.env.TICKETS_FAILURE_RATE ?? 0) });
    const agent = new NexoAgent({ llm: createMastraLlm(), tickets, conversations });
    const guard = createAbuseGuard({ usage: new UsageStore(db) });
    globalForNexo.__nexo = { db, tickets, conversations, agent, config: agentConfigFromEnv(), guard };
  }
  return globalForNexo.__nexo;
}
