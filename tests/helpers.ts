import type { LlmPort } from '../src/agent/llm';
import { NexoAgent, type AgentDeps } from '../src/agent/nexo-agent';
import type { AgentEvent, Decision } from '../src/agent/schemas';
import { openDatabase } from '../src/services/db';
import { ConversationStore } from '../src/services/conversations';
import { seedIfEmpty } from '../src/services/seed';
import { TicketService, type TicketServiceOptions } from '../src/services/tickets/ticket-service';

export const NOW = new Date(2026, 9, 27, 10, 5); // terça 10:05
export const ANA = 'ana.souza@nexo.com.br';
export const CARLA = 'carla.mendes@nexo.com.br';

export const decision = (over: Partial<Decision> = {}): Decision => ({
  understanding: 'teste',
  intent: 'outro',
  confidence: 0.9,
  reasoning: 'teste',
  searchQuery: null,
  ticketRef: null,
  duplicateOf: null,
  confirmation: null,
  draft: null,
  updateNote: null,
  caseSummary: null,
  ...over,
});

/** LLM de mentira: devolve as decisões enfileiradas e um texto fixo. Não usa rede. */
export class FakeLlm implements LlmPort {
  readonly models = { decider: 'fake-decider', responder: 'fake-responder' };
  readonly prompts: string[] = [];
  constructor(private queue: Decision[] = []) {}
  push(...d: Decision[]): void {
    this.queue.push(...d);
  }
  async decide({ prompt }: { prompt: string }) {
    this.prompts.push(prompt);
    const next = this.queue.shift();
    if (!next) throw new Error('FakeLlm sem decisão na fila');
    return { decision: next, call: { model: 'fake-decider', ms: 1 } };
  }
  async *respond(): AsyncIterable<string> {
    yield 'resposta ';
    yield 'de teste';
  }
}

export function setup(opts: { ticketOpts?: TicketServiceOptions; config?: AgentDeps['config'] } = {}) {
  const db = openDatabase(':memory:');
  seedIfEmpty(db, NOW);
  const llm = new FakeLlm();
  const conversations = new ConversationStore(db, () => NOW);
  const tickets = new TicketService(db, { clock: () => NOW, ...opts.ticketOpts });
  const agent = new NexoAgent({
    llm,
    tickets,
    conversations,
    clock: () => NOW,
    sleep: async () => {},
    ...(opts.config ? { config: opts.config } : {}),
  });
  return { db, llm, conversations, tickets, agent };
}

export async function send(agent: NexoAgent, convId: string, email: string, text: string) {
  const events: AgentEvent[] = [];
  for await (const ev of agent.handleMessage(convId, email, text)) events.push(ev);
  const done = events.find((e) => e.type === 'done');
  return {
    events,
    done: done && done.type === 'done' ? done : undefined,
    stepKinds: events.flatMap((e) => (e.type === 'step' ? [e.step.kind] : [])),
  };
}

export const fullDraft = {
  type: 'INC' as const,
  title: 'VPN não conecta (erro 809)',
  description: 'Erro 809 ao conectar na VPN, Windows 11. Reinstalar o cliente não é opção para esse sistema.',
  category: 'Rede e VPN' as const,
  affected: 'solicitante' as const,
  blocksWork: true,
  commitmentToday: null,
  workStopped: null,
};
