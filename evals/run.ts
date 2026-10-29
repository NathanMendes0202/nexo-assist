import { NexoAgent } from '../src/agent/nexo-agent';
import type { LlmPort } from '../src/agent/llm';
import { DecisionSchema, type AgentEvent, type Decision } from '../src/agent/schemas';
import type { ConversationStatus, OutcomeKind, PartialDraft } from '../src/domain/conversation';
import { openDatabase } from '../src/services/db';
import { ConversationStore } from '../src/services/conversations';
import { seedIfEmpty } from '../src/services/seed';
import { TicketService } from '../src/services/tickets/ticket-service';

/** Mesma "hora" dos testes: terça 27/10/2026, 10:05. Os dados de exemplo são relativos a ela. */
export const EVAL_NOW = new Date(2026, 9, 27, 10, 5);

export type Criterion = 'Qualidade das decisões' | 'Condução da conversa' | 'Regras do service desk' | 'Privacidade' | 'Escopo e segurança';

export interface TurnExpect {
  outcome?: OutcomeKind | OutcomeKind[];
  intent?: string | string[];
  status?: ConversationStatus;
  ticketsDelta?: number;
  createdTicketId?: string;
  silenced?: boolean;
  blocksContain?: string[];
  notContain?: string[];
  maxConfidence?: number;
}

export interface EvalTurn {
  say: string;
  oracle: Partial<Decision>;
  expect: TurnExpect;
}

export interface EvalCase {
  id: string;
  title: string;
  criterion: Criterion;
  user: string;
  turns: EvalTurn[];
  soft?: boolean;
}

export const baseDecision: Decision = {
  understanding: 'oráculo',
  intent: 'outro',
  confidence: 0.9,
  reasoning: 'decisão esperada do caso de avaliação',
  searchQuery: null,
  ticketRef: null,
  duplicateOf: null,
  confirmation: null,
  draft: null,
  updateNote: null,
  caseSummary: null,
};

export const draftOf = (over: Partial<PartialDraft>): PartialDraft => ({
  type: null,
  title: null,
  description: null,
  category: null,
  affected: null,
  blocksWork: null,
  commitmentToday: null,
  workStopped: null,
  ...over,
});

export class OracleLlm implements LlmPort {
  readonly models = { decider: 'oracle', responder: 'oracle' };
  next: Partial<Decision> = {};
  async decide() {
    return { decision: DecisionSchema.parse({ ...baseDecision, ...this.next }), call: { model: 'oracle', ms: 0 } };
  }
  async *respond(): AsyncIterable<string> {
    yield 'ok';
  }
}

export interface TurnResult {
  say: string;
  outcome: OutcomeKind | null;
  intent: string | null;
  confidence: number | null;
  status: ConversationStatus | null;
  ticketsDelta: number;
  createdTicketId: string | null;
  silenced: boolean;
  text: string;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  failures: string[];
}

export interface CaseResult {
  id: string;
  title: string;
  criterion: Criterion;
  soft: boolean;
  passed: boolean;
  turns: TurnResult[];
}

const asList = <T>(v: T | T[]): T[] => (Array.isArray(v) ? v : [v]);

export async function runCase(c: EvalCase, llm: LlmPort): Promise<CaseResult> {
  const db = openDatabase(':memory:');
  seedIfEmpty(db, EVAL_NOW);
  const conversations = new ConversationStore(db, () => EVAL_NOW);
  const tickets = new TicketService(db, { clock: () => EVAL_NOW });
  const agent = new NexoAgent({ llm, tickets, conversations, clock: () => EVAL_NOW, sleep: async () => {} });

  const conv = conversations.create(c.user);
  const startCount = (await tickets.listByRequester(c.user)).length;
  const results: TurnResult[] = [];

  for (const turn of c.turns) {
    if (llm instanceof OracleLlm) llm.next = turn.oracle;
    const t0 = Date.now();
    const { done, silenced } = await collect(agent, conv.id, c.user, turn.say);

    const count = (await tickets.listByRequester(c.user)).length;
    const blocksJson = done ? JSON.stringify(done.blocks) : '';
    const created = done?.blocks.find((b) => b.type === 'ticket_card' && done.trace.outcome === 'chamado_criado');
    const r: TurnResult = {
      say: turn.say,
      outcome: done?.trace.outcome ?? null,
      intent: done?.trace.intent ?? null,
      confidence: done?.trace.confidence ?? null,
      status: done?.conversationStatus ?? conversations.get(conv.id)?.status ?? null,
      ticketsDelta: count - startCount,
      createdTicketId: created && created.type === 'ticket_card' ? created.ticket.id : null,
      silenced,
      text: done?.text ?? '',
      ms: Date.now() - t0,
      inputTokens: done?.trace.models.decider?.inputTokens ?? 0,
      outputTokens: done?.trace.models.decider?.outputTokens ?? 0,
      failures: [],
    };

    const e = turn.expect;
    const fail = (m: string) => r.failures.push(m);
    if (e.outcome && !(r.outcome && asList(e.outcome).includes(r.outcome))) fail(`desfecho: esperava ${asList(e.outcome).join(' ou ')}, veio ${r.outcome}`);
    if (e.intent && !(r.intent && asList(e.intent).includes(r.intent))) fail(`intenção: esperava ${asList(e.intent).join(' ou ')}, veio ${r.intent}`);
    if (e.status && r.status !== e.status) fail(`estado da conversa: esperava ${e.status}, veio ${r.status}`);
    if (e.ticketsDelta !== undefined && r.ticketsDelta !== e.ticketsDelta) fail(`chamados criados: esperava ${e.ticketsDelta}, veio ${r.ticketsDelta}`);
    if (e.createdTicketId && r.createdTicketId !== e.createdTicketId) fail(`chamado criado: esperava ${e.createdTicketId}, veio ${r.createdTicketId}`);
    if (e.silenced !== undefined && r.silenced !== e.silenced) fail(`silêncio do agent: esperava ${e.silenced}, veio ${r.silenced}`);
    if (e.maxConfidence !== undefined && (r.confidence ?? 1) > e.maxConfidence) fail(`confiança ${r.confidence} acima de ${e.maxConfidence}`);
    for (const s of e.blocksContain ?? []) if (!blocksJson.includes(s)) fail(`os blocos deveriam conter "${s}"`);
    for (const s of e.notContain ?? []) if ((blocksJson + r.text).includes(s)) fail(`vazou "${s}" na resposta`);
    results.push(r);
  }

  return { id: c.id, title: c.title, criterion: c.criterion, soft: Boolean(c.soft), passed: results.every((t) => t.failures.length === 0), turns: results };
}

type DoneEvent = Extract<AgentEvent, { type: 'done' }>;

async function collect(agent: NexoAgent, convId: string, email: string, text: string) {
  let done: DoneEvent | undefined;
  let silenced = false;
  for await (const ev of agent.handleMessage(convId, email, text)) {
    if (ev.type === 'done') done = ev;
    if (ev.type === 'silenced') silenced = true;
  }
  return { done, silenced };
}

export function renderReport(results: CaseResult[], meta: { mode: string; models: string; at: string }): string {
  const hard = results.filter((r) => !r.soft);
  const lines: string[] = [];
  lines.push(`# Avaliação do agent`, '', `- Modo: **${meta.mode}**`, `- Modelos: ${meta.models}`, `- Execução: ${meta.at}`, '');
  lines.push(`**${results.filter((r) => r.passed).length}/${results.length} casos passaram** (${hard.filter((r) => r.passed).length}/${hard.length} dos casos objetivos).`, '');

  lines.push('| Critério | Casos | Passaram |', '| --- | ---: | ---: |');
  const criteria = [...new Set(results.map((r) => r.criterion))];
  for (const k of criteria) {
    const group = results.filter((r) => r.criterion === k);
    lines.push(`| ${k} | ${group.length} | ${group.filter((r) => r.passed).length} |`);
  }

  const turns = results.flatMap((r) => r.turns);
  const inTok = turns.reduce((a, t) => a + t.inputTokens, 0);
  const outTok = turns.reduce((a, t) => a + t.outputTokens, 0);
  const avgMs = turns.length ? Math.round(turns.reduce((a, t) => a + t.ms, 0) / turns.length) : 0;
  lines.push('', `Mensagens avaliadas: ${turns.length} · tempo médio por mensagem: ${avgMs} ms · tokens do decisor: ${inTok} entrada / ${outTok} saída (≈ ${turns.length ? Math.round(inTok / turns.length) : 0} / ${turns.length ? Math.round(outTok / turns.length) : 0} por mensagem).`, '');

  lines.push('## Casos', '');
  for (const r of results) {
    lines.push(`### ${r.passed ? '✅' : '❌'} ${r.title}${r.soft ? ' _(depende do julgamento do modelo)_' : ''}`, '');
    for (const t of r.turns) {
      lines.push(`- “${t.say}” → **${t.outcome ?? (t.silenced ? 'silêncio' : '—')}**${t.intent ? ` (${t.intent}, confiança ${t.confidence !== null ? Math.round(t.confidence * 100) : '—'}%)` : ''}`);
      for (const f of t.failures) lines.push(`  - ⚠️ ${f}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
