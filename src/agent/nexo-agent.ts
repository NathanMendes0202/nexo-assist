import { randomUUID } from 'node:crypto';
import { canReopen, getSla, isOpen } from '../domain/rules';
import { computeDueAt, SLA_LABEL } from '../domain/sla';
import type {
  ModelCall,
  OutcomeKind,
  PartialDraft,
  Pending,
  StepKind,
  TraceStep,
  TransferReason,
  TurnTrace,
  UiBlock,
} from '../domain/conversation';
import type { Clock, Employee, NewTicketInput, Ticket } from '../domain/types';
import type { Conversation, ConversationStore } from '../services/conversations';
import { findEmployee } from '../services/seed';
import { searchArticles } from '../services/helpdesk/search';
import { TicketNotFoundError, TicketNotReopenableError, TicketServiceUnavailableError } from '../services/tickets/errors';
import { withRetry } from '../services/tickets/resilience';
import type { TicketService } from '../services/tickets/ticket-service';
import { ANALYST_OPTION, CONFIRM_CREATE, CONFIRM_UPDATE, quick, START_OPTIONS, ticketCard } from './blocks';
import { fallbackText } from './fallback-text';
import { firstName, formatDue } from './format';
import type { LlmPort } from './llm';
import {
  derivePriority,
  mergeDraft,
  missingFields,
  sanitizeDecision,
  toComplete,
  toPartial,
  type MissingField,
} from './policy';
import { buildDeciderPrompt, buildResponderPrompt } from './prompts';
import type { AgentEvent, Decision } from './schemas';

export interface AgentConfig {
  messageLimit: number;
  confidenceThreshold: number;
  recentMessages: number;
}

export function agentConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AgentConfig {
  return {
    messageLimit: Number(env.NEXO_MESSAGE_LIMIT ?? 30),
    confidenceThreshold: Number(env.NEXO_CONFIDENCE_THRESHOLD ?? 0.6),
    recentMessages: 8,
  };
}

export interface AgentDeps {
  llm: LlmPort;
  tickets: TicketService;
  conversations: ConversationStore;
  clock?: Clock;
  config?: Partial<AgentConfig>;
  sleep?: (ms: number) => Promise<void>;
}

// ---------- tipos internos ----------

interface Outcome {
  kind: OutcomeKind;
  facts: Record<string, unknown>;
  question?: string;
  blocks: UiBlock[];
  fixedText?: string;
}

interface ActResult {
  outcome: Outcome;
  pending: Pending | null;
}

interface Turn {
  conv: Conversation;
  userEmail: string;
  employee: Employee | undefined;
  text: string;
  now: Date;
  tickets: Ticket[] | null;
  trace: TraceBuilder;
  history: Array<{ role: string; content: string }>;
}

const REASON_TEXT: Record<TransferReason, string> = {
  pedido_do_funcionario: 'o funcionário pediu para falar com uma pessoa',
  caso_critico: 'caso crítico: algo parado para a equipe ou para a empresa',
  chamado_vencido: 'o chamado está com o prazo vencido',
  baixa_confianca: 'o agent não teve segurança para decidir',
  erro_no_sistema: 'o sistema de chamados ficou indisponível',
};

const pct = (n: number): number => Math.round(n * 100);

class TraceBuilder {
  readonly steps: TraceStep[] = [];
  readonly overrides: string[] = [];
  private drained = 0;

  constructor(private readonly clock: Clock) {}

  add(
    kind: StepKind,
    label: string,
    detail: string,
    opts: { status?: TraceStep['status']; visible?: boolean; data?: unknown } = {},
  ): void {
    this.steps.push({
      kind,
      label,
      detail,
      status: opts.status ?? 'ok',
      visible: opts.visible ?? true,
      at: this.clock().toISOString(),
      ...(opts.data !== undefined ? { data: opts.data } : {}),
    });
  }

  override(note: string): void {
    this.overrides.push(note);
    this.add('aplicou_regra', 'aplicou uma regra do service desk', note, { visible: false, status: 'aviso' });
  }

  drain(): TraceStep[] {
    const fresh = this.steps.slice(this.drained);
    this.drained = this.steps.length;
    return fresh;
  }
}

export class NexoAgent {
  private readonly clock: Clock;
  private readonly config: AgentConfig;

  constructor(private readonly deps: AgentDeps) {
    this.clock = deps.clock ?? (() => new Date());
    this.config = { ...agentConfigFromEnv(), ...deps.config };
  }

  async *handleMessage(conversationId: string, userEmail: string, text: string): AsyncGenerator<AgentEvent> {
    const { conversations, llm } = this.deps;
    const conv = conversations.getOwned(conversationId, userEmail);

    if (conv.status !== 'com_agent') {
      if (conv.status !== 'encerrada') conversations.addMessage(conv.id, 'user', text);
      yield { type: 'silenced', conversationStatus: conv.status };
      return;
    }
    if (conversations.userMessageCount(conv.id) >= this.config.messageLimit) {
      yield { type: 'limit_reached', limit: this.config.messageLimit };
      return;
    }

    const history = conversations
      .recentMessages(conv.id, this.config.recentMessages)
      .map((m) => ({ role: m.role, content: m.content }));
    conversations.addMessage(conv.id, 'user', text);

    const startedAt = this.clock();
    const t0 = Date.now();
    const trace = new TraceBuilder(this.clock);
    const turn: Turn = {
      conv,
      userEmail,
      employee: findEmployee(userEmail),
      text,
      now: startedAt,
      tickets: null,
      trace,
      history,
    };

    // 1) contexto
    try {
      turn.tickets = await this.callTickets(trace, 'listar chamados', () => this.deps.tickets.listByRequester(userEmail));
      const open = turn.tickets.filter(isOpen).length;
      trace.add('carregou_contexto', 'carregou o contexto', `${turn.tickets.length} chamados seus (${open} abertos); ${history.length} mensagens recentes.`, { visible: false });
    } catch {
      trace.add(
        'carregou_contexto',
        'sistema de chamados indisponível',
        'Não consegui consultar os chamados nem depois de tentar de novo. Sigo com o que não depende dele.',
        { status: 'erro' },
      );
    }
    for (const step of trace.drain()) yield { type: 'step', step };

    // 2–4) decidir, aplicar regras e executar
    let understanding = '';
    let intent = 'erro';
    let confidence = 0;
    let reasoning = 'Falha antes de o modelo decidir.';
    let deciderCall: ModelCall | undefined;
    let result: ActResult;

    try {
      const tickets = turn.tickets;
      const prompt = buildDeciderPrompt({
        now: startedAt,
        employee: turn.employee,
        tickets: tickets
          ? tickets.slice(0, 15).map((t) => ({
              id: t.id,
              title: t.title,
              category: t.category,
              priority: t.priority,
              status: t.status,
              updatedAt: t.updatedAt,
              overdue: getSla(t, startedAt).overdue,
              reopenable: canReopen(t, startedAt),
            }))
          : null,
        pending: conv.pending,
        history,
        message: text,
      });

      const decided = await llm.decide({ prompt });
      deciderCall = decided.call;
      const reopenable = new Set((tickets ?? []).filter((t) => canReopen(t, startedAt)).map((t) => t.id));
      const sanitized = sanitizeDecision(decided.decision, tickets, reopenable);
      for (const note of sanitized.overrides) trace.override(note);
      const decision = sanitized.decision;

      understanding = decision.understanding;
      intent = decision.intent;
      confidence = decision.confidence;
      reasoning = decision.reasoning;

      result = await this.act(turn, decision, sanitized.rejectedRefs);
    } catch (err) {
      trace.add('aplicou_regra', 'tive um problema interno', err instanceof Error ? err.message : String(err), {
        status: 'erro',
      });
      result = { pending: conv.pending, outcome: { kind: 'erro_interno', facts: {}, blocks: [quick([ANALYST_OPTION])] } };
    }
    for (const step of trace.drain()) yield { type: 'step', step };

    // 5) resposta em linguagem natural
    const { outcome } = result;
    let reply = '';
    const responderStart = Date.now();
    const useLlm = !outcome.fixedText && outcome.kind !== 'erro_interno';
    if (useLlm) {
      try {
        const prompt = buildResponderPrompt({
          employeeFirstName: firstName(turn.employee?.name ?? 'você'),
          deviceOs: turn.employee?.device?.os ?? null,
          history,
          message: text,
          outcome: outcome.kind,
          facts: outcome.facts,
          question: outcome.question ?? null,
        });
        for await (const delta of llm.respond({ prompt })) {
          reply += delta;
          yield { type: 'text', delta };
        }
      } catch {
      }
    }
    if (!reply.trim()) {
      reply = outcome.fixedText ?? fallbackText(outcome.kind, outcome.facts, outcome.question ?? null);
      yield { type: 'text', delta: reply };
    }
    const responderCall: ModelCall | undefined = useLlm
      ? { model: llm.models.responder, ms: Date.now() - responderStart }
      : undefined;

    if (outcome.blocks.length) yield { type: 'blocks', blocks: outcome.blocks };

    // 6) persistir
    const turnTrace: TurnTrace = {
      turnId: randomUUID(),
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - t0,
      understanding,
      intent,
      confidence,
      reasoning,
      steps: trace.steps,
      overrides: trace.overrides,
      outcome: outcome.kind,
      models: { ...(deciderCall ? { decider: deciderCall } : {}), ...(responderCall ? { responder: responderCall } : {}) },
    };
    const saved = conversations.addMessage(conv.id, 'agent', reply, { blocks: outcome.blocks, trace: turnTrace });
    conversations.setPending(conv.id, result.pending);

    yield {
      type: 'done',
      messageId: saved.id,
      text: reply,
      blocks: outcome.blocks,
      trace: turnTrace,
      conversationStatus: conversations.getOwned(conv.id, userEmail).status,
      userMessageCount: conversations.userMessageCount(conv.id),
    };
  }

  // ------------------------------------------------------------------
  // Regras + execução por intenção
  // ------------------------------------------------------------------

  private async act(t: Turn, d: Decision, rejected: string[]): Promise<ActResult> {
    const { trace } = t;
    let intent = d.intent;

    // Guardas: o modelo pode errar a intenção em relação ao estado da conversa.
    if (intent === 'confirmar' && !t.conv.pending) {
      trace.override('O modelo entendeu uma confirmação, mas não há nada aguardando confirmação.');
      return {
        pending: null,
        outcome: { kind: 'nada_a_confirmar', facts: {}, blocks: [quick(START_OPTIONS)] },
      };
    }
    if (intent === 'confirmar' && t.conv.pending?.kind === 'collecting_ticket') {
      trace.override('Ainda estou coletando dados do chamado, então a resposta foi tratada como continuação do relato.');
      intent = 'abrir_chamado';
    }

    // Sem segurança: não decide sozinho (Anexo A: transferência).
    const exempt = intent === 'saudacao' || intent === 'fora_de_escopo';
    if (!exempt && d.confidence < this.config.confidenceThreshold) {
      trace.override(
        `Confiança de ${pct(d.confidence)}% abaixo do mínimo de ${pct(this.config.confidenceThreshold)}%: o agent não decide sozinho e chama um analista.`,
      );
      return this.actTransfer(t, d, 'baixa_confianca');
    }

    switch (intent) {
      case 'saudacao':
        return { pending: t.conv.pending, outcome: { kind: 'saudacao', facts: {}, blocks: [quick(START_OPTIONS)] } };
      case 'duvida':
        return this.actDuvida(t, d);
      case 'consultar_chamado':
        return this.actConsultar(t, d, rejected);
      case 'abrir_chamado':
        return this.actAbrir(t, d);
      case 'atualizar_chamado':
        return this.actAtualizar(t, d, rejected);
      case 'confirmar':
        return this.actConfirmar(t, d);
      case 'falar_com_analista':
        return this.actTransfer(t, d, 'pedido_do_funcionario');
      case 'fora_de_escopo':
        trace.add('recusou_fora_de_escopo', 'identificou assunto fora de TI', `Escopo é só TI. Entendi: ${d.understanding}`);
        return {
          pending: t.conv.pending,
          outcome: { kind: 'fora_de_escopo', facts: { assunto: d.understanding }, blocks: [] },
        };
      case 'outro':
        return {
          pending: t.conv.pending,
          outcome: {
            kind: 'conversa_geral',
            facts: { understanding: d.understanding },
            question: 'Não tenho certeza do que você precisa. Quer tirar uma dúvida, abrir um chamado ou ver os seus chamados?',
            blocks: [quick(START_OPTIONS)],
          },
        };
    }
  }

  private actDuvida(t: Turn, d: Decision): ActResult {
    const query = d.searchQuery?.trim() || t.text;
    const matches = searchArticles(query, 3);
    t.trace.add(
      'buscou_central',
      'buscou na central de ajuda',
      `Busca por "${query}" → ${matches.length} artigo(s)${matches[0] ? `; melhor: "${matches[0].article.title}"` : ''}.`,
      { data: matches.map((m) => ({ id: m.article.id, title: m.article.title, score: m.score })) },
    );
    if (matches.length === 0) {
      return {
        pending: t.conv.pending,
        outcome: {
          kind: 'duvida_sem_artigo',
          facts: { query },
          blocks: [quick([{ label: 'Abrir um chamado', value: 'Quero abrir um chamado sobre isso' }, ANALYST_OPTION])],
        },
      };
    }
    return {
      pending: t.conv.pending,
      outcome: {
        kind: 'duvida_respondida',
        facts: {
          deviceOs: t.employee?.device?.os ?? null,
          articles: matches.map((m) => ({ titulo: m.article.title, texto: m.article.body, limitacao: m.article.limitations ?? null })),
        },
        blocks: [
          quick([
            { label: 'Resolveu, obrigado', value: 'Resolveu, obrigado!' },
            { label: 'Não resolveu, abrir chamado', value: 'Não resolveu, quero abrir um chamado' },
          ]),
        ],
      },
    };
  }

  private async actConsultar(t: Turn, d: Decision, rejected: string[]): Promise<ActResult> {
    const { trace, now } = t;
    if (!t.tickets) return this.unavailable(t, 'consultar os seus chamados');
    const mine = t.tickets;
    const open = mine.filter(isOpen);
    trace.add('consultou_chamados', 'consultou seus chamados', `${mine.length} chamados no total, ${open.length} aberto(s).`, {
      data: mine.map((x) => x.id),
    });

    if (rejected.length > 0) {
      return {
        pending: t.conv.pending,
        outcome: {
          kind: 'chamado_nao_encontrado',
          facts: {},
          blocks: open.length ? [{ type: 'ticket_cards', tickets: open.map((x) => ticketCard(x, now)), selectable: true }] : [],
        },
      };
    }

    let focus = d.ticketRef ? mine.find((x) => x.id === d.ticketRef) : undefined;
    if (!focus && open.length === 1) focus = open[0];

    if (focus) return this.showTicket(t, focus.id);

    if (open.length === 0) {
      const recent = mine.slice(0, 3);
      return {
        pending: t.conv.pending,
        outcome: {
          kind: 'chamados_listados',
          facts: { abertos: 0, recentes: recent.map((x) => ({ id: x.id, titulo: x.title, status: x.status })) },
          blocks: recent.length ? [{ type: 'ticket_cards', tickets: recent.map((x) => ticketCard(x, now)), selectable: false }] : [],
        },
      };
    }

    const cards = open.map((x) => ticketCard(x, now));
    return {
      pending: t.conv.pending,
      outcome: {
        kind: 'chamados_listados',
        facts: { abertos: open.length, vencidos: cards.filter((c) => c.overdue).map((c) => c.id) },
        question: 'Qual deles você quer ver?',
        blocks: [{ type: 'ticket_cards', tickets: cards, selectable: true }],
      },
    };
  }

  private async showTicket(t: Turn, ticketId: string): Promise<ActResult> {
    const { trace, now } = t;
    try {
      const detail = await this.callTickets(trace, `ver ${ticketId}`, () => this.deps.tickets.getById(t.userEmail, ticketId));
      const sla = getSla(detail, now);
      trace.add(
        'consultou_prazo',
        'consultou o prazo',
        sla.tracked
          ? `Prioridade ${detail.priority} (${SLA_LABEL[detail.priority]}). Prazo: ${formatDue(sla.dueAt!)}. ${sla.overdue ? 'Já venceu.' : 'Dentro do prazo.'}`
          : `Chamado "${detail.status}": não tem prazo de resposta em andamento.`,
        { status: sla.overdue ? 'aviso' : 'ok' },
      );
      const card = ticketCard(detail, now);
      const lastNote = detail.events.at(-1)?.note ?? null;
      const options = [
        ...(sla.overdue ? [ANALYST_OPTION] : []),
        { label: 'Adicionar informação', value: `Quero adicionar uma informação ao ${detail.id}` },
        ...(sla.overdue ? [{ label: 'Não, obrigado', value: 'Não, obrigado' }] : [ANALYST_OPTION]),
      ];
      return {
        pending: t.conv.pending,
        outcome: {
          kind: 'chamado_detalhado',
          facts: {
            id: detail.id,
            titulo: detail.title,
            status: detail.status,
            prioridade: detail.priority,
            vencido: sla.overdue,
            prazo: sla.dueAt ? formatDue(sla.dueAt) : null,
            ultimaAtualizacao: lastNote,
            oferecerAnalista: sla.overdue,
          },
          blocks: [{ type: 'ticket_card', ticket: card, lastNote }, quick(options)],
        },
      };
    } catch (err) {
      if (err instanceof TicketNotFoundError) {
        return { pending: t.conv.pending, outcome: { kind: 'chamado_nao_encontrado', facts: {}, blocks: [] } };
      }
      return this.unavailable(t, `consultar o ${ticketId}`);
    }
  }

  private async actAbrir(t: Turn, d: Decision): Promise<ActResult> {
    const { trace, now } = t;
    const pend = t.conv.pending;
    const prev: PartialDraft | null =
      pend?.kind === 'collecting_ticket' ? pend.draft : pend?.kind === 'confirm_create' ? toPartial(pend.draft) : null;
    const merged = mergeDraft(prev, d.draft);
    trace.add('preparou_rascunho', 'montou o rascunho', describeDraft(merged), { data: merged });

    if (t.tickets) {
      const dup = d.duplicateOf ? t.tickets.find((x) => x.id === d.duplicateOf) : undefined;
      let candidates = 0;
      if (merged.category) {
        try {
          const related = await this.callTickets(trace, 'checar duplicidade', () =>
            this.deps.tickets.findRelated(t.userEmail, merged.category!),
          );
          candidates = related.open.length + related.reopenable.length;
        } catch {
          trace.add('verificou_duplicidade', 'verificou duplicidade', 'Não consegui consultar os chamados relacionados.', { status: 'aviso' });
        }
      }
      trace.add(
        'verificou_duplicidade',
        'verificou duplicidade',
        dup
          ? `O modelo apontou ${dup.id} ("${dup.title}") como o mesmo problema: vou atualizar em vez de abrir outro.`
          : `${candidates} chamado(s) abertos ou reabríveis na mesma categoria; o modelo não viu o mesmo problema em nenhum.`,
        { data: { duplicateOf: dup?.id ?? null, candidates } },
      );
      if (dup) return this.proposeUpdate(t, dup, d.updateNote ?? merged.description ?? t.text);
    } else {
      trace.add('verificou_duplicidade', 'verificou duplicidade', 'Sistema de chamados indisponível: a checagem de duplicidade ficou pendente.', { status: 'aviso' });
    }

    const missing = missingFields(merged);
    if (missing.length > 0) {
      const ask = askFor(missing);
      trace.add('pediu_informacao', 'pediu mais informações', `Faltam: ${missing.join(', ')}. Pergunto uma coisa de cada vez.`, {
        data: { missing },
      });
      return {
        pending: { kind: 'collecting_ticket', draft: merged },
        outcome: {
          kind: 'pedindo_informacao',
          facts: { faltando: missing, jaSei: describeDraft(merged) },
          question: ask.question,
          blocks: ask.options.length ? [quick(ask.options)] : [],
        },
      };
    }

    const complete = toComplete(merged)!;
    const { priority, reason } = derivePriority(complete);
    const due = computeDueAt(priority, now);
    trace.add(
      'classificou_prioridade',
      'classificou a prioridade',
      `${priority}: ${reason} Prazo de ${SLA_LABEL[priority]} (até ${formatDue(due.toISOString())}).`,
      {
        data: {
          afetado: complete.affected,
          impedeDeTrabalhar: complete.blocksWork,
          compromissoHoje: complete.commitmentToday,
          parado: complete.workStopped,
        },
      },
    );
    const escalates = priority === 'Crítica';
    return {
      pending: { kind: 'confirm_create', draft: complete, priority, priorityReason: reason },
      outcome: {
        kind: 'rascunho_proposto',
        facts: {
          titulo: complete.title,
          tipo: complete.type,
          categoria: complete.category,
          prioridade: priority,
          motivoDaPrioridade: reason,
          prazo: SLA_LABEL[priority],
          chamaraAnalistaAoCriar: escalates,
        },
        blocks: [
          {
            type: 'draft',
            kind: 'create',
            ticketType: complete.type,
            title: complete.title,
            description: complete.description,
            category: complete.category,
            affected: complete.affected,
            priority,
            priorityReason: reason,
            dueLabel: formatDue(due.toISOString()),
            slaLabel: SLA_LABEL[priority],
          },
          quick(CONFIRM_CREATE),
        ],
      },
    };
  }

  private proposeUpdate(t: Turn, ticket: Ticket, note: string): ActResult {
    const { trace, now } = t;
    const reopen = !isOpen(ticket);
    if (reopen && !canReopen(ticket, now)) {
      trace.override(`${ticket.id} foi resolvido há mais de 7 dias ou foi encerrado: não pode ser reaberto.`);
      return {
        pending: null,
        outcome: {
          kind: 'nao_pode_reabrir',
          facts: { id: ticket.id },
          blocks: [quick([{ label: 'Abrir um novo chamado', value: 'Quero abrir um novo chamado sobre isso' }, ANALYST_OPTION])],
        },
      };
    }
    trace.add(
      'preparou_rascunho',
      reopen ? `preparou a reabertura do ${ticket.id}` : `preparou a atualização do ${ticket.id}`,
      reopen ? 'Chamado resolvido há até 7 dias: pode ser reaberto com a nova informação.' : 'Chamado aberto: a informação nova vai como atualização.',
    );
    return {
      pending: { kind: 'confirm_update', ticketId: ticket.id, note, reopen },
      outcome: {
        kind: 'atualizacao_proposta',
        facts: { id: ticket.id, titulo: ticket.title, reabrir: reopen },
        blocks: [
          { type: 'draft', kind: 'update', ticketId: ticket.id, title: ticket.title, description: note, reopen },
          quick(CONFIRM_UPDATE),
        ],
      },
    };
  }

  private actAtualizar(t: Turn, d: Decision, rejected: string[]): ActResult {
    if (!t.tickets) return this.unavailable(t, 'atualizar o chamado');
    const open = t.tickets.filter(isOpen);
    const ticket = d.ticketRef ? t.tickets.find((x) => x.id === d.ticketRef) : undefined;
    if (!ticket) {
      t.trace.add('pediu_informacao', 'perguntou qual chamado', 'Não ficou claro qual chamado atualizar.');
      return {
        pending: t.conv.pending,
        outcome: {
          kind: rejected.length ? 'chamado_nao_encontrado' : 'pedindo_informacao',
          facts: {},
          question: 'Qual chamado você quer atualizar?',
          blocks: open.length ? [{ type: 'ticket_cards', tickets: open.map((x) => ticketCard(x, t.now)), selectable: true }] : [],
        },
      };
    }
    return this.proposeUpdate(t, ticket, d.updateNote?.trim() || t.text);
  }

  private async actConfirmar(t: Turn, d: Decision): Promise<ActResult> {
    const { trace } = t;
    const pend = t.conv.pending!;
    const answer = d.confirmation;

    if (answer === null) {
      return {
        pending: pend,
        outcome: {
          kind: 'conversa_geral',
          facts: {},
          question: 'Posso seguir com o que está no rascunho?',
          blocks: [quick(pend.kind === 'confirm_update' ? CONFIRM_UPDATE : CONFIRM_CREATE)],
        },
      };
    }

    if (answer === 'nao') {
      trace.add('aplicou_regra', 'cancelou a ação', 'O funcionário não confirmou, então nada foi criado nem alterado.', { visible: false });
      return {
        pending: null,
        outcome: { kind: 'confirmacao_negada', facts: {}, blocks: [quick([ANALYST_OPTION, ...START_OPTIONS.slice(0, 1)])] },
      };
    }

    if (answer === 'ajustar') {
      if (pend.kind === 'confirm_update') {
        const ticket = t.tickets?.find((x) => x.id === pend.ticketId);
        if (!ticket) return this.unavailable(t, 'ajustar a atualização');
        return this.proposeUpdate(t, ticket, d.updateNote?.trim() || pend.note);
      }
      return this.actAbrir(t, d);
    }

    // answer === 'sim'
    if (pend.kind === 'confirm_create') return this.executeCreate(t, d, pend);
    if (pend.kind === 'confirm_update') return this.executeUpdate(t, pend);
    return this.actAbrir(t, d);
  }

  private async executeCreate(t: Turn, d: Decision, pend: Extract<Pending, { kind: 'confirm_create' }>): Promise<ActResult> {
    const { trace, now } = t;
    const input: NewTicketInput = {
      type: pend.draft.type,
      title: pend.draft.title,
      description: pend.draft.description,
      category: pend.draft.category,
      priority: pend.priority,
      affected: pend.draft.affected,
    };
    try {
      const created = await this.callTickets(trace, 'criar chamado', () => this.deps.tickets.create(t.userEmail, input));
      trace.add('criou_chamado', `criou o ${created.id}`, `Confirmado pelo funcionário. ${created.priority}, ${created.category}, prazo de ${SLA_LABEL[created.priority]}.`, {
        data: { id: created.id },
      });
      const blocks: UiBlock[] = [{ type: 'ticket_card', ticket: ticketCard(created, now), lastNote: null }];
      const facts: Record<string, unknown> = {
        id: created.id,
        titulo: created.title,
        prioridade: created.priority,
        prazo: SLA_LABEL[created.priority],
      };
      if (created.priority === 'Crítica') {
        const summary =
          d.caseSummary ?? `Chamado crítico ${created.id}: ${created.title}. ${created.description}`;
        blocks.push(await this.doTransfer(t, 'caso_critico', summary, created.id));
        facts.analistaChamado = true;
      }
      return { pending: null, outcome: { kind: 'chamado_criado', facts, blocks } };
    } catch (err) {
      if (err instanceof TicketServiceUnavailableError) return this.unavailable(t, 'criar o chamado', pend);
      throw err;
    }
  }

  private async executeUpdate(t: Turn, pend: Extract<Pending, { kind: 'confirm_update' }>): Promise<ActResult> {
    const { trace, now } = t;
    try {
      const { ticket, reopened } = await this.callTickets(trace, 'atualizar chamado', () =>
        this.deps.tickets.addUpdate(t.userEmail, pend.ticketId, { note: pend.note }),
      );
      trace.add(
        reopened ? 'reabriu_chamado' : 'atualizou_chamado',
        reopened ? `reabriu o ${ticket.id}` : `atualizou o ${ticket.id}`,
        reopened ? 'Estava resolvido há até 7 dias: reaberto com a nova informação.' : 'Informação nova registrada no chamado existente.',
      );
      return {
        pending: null,
        outcome: {
          kind: reopened ? 'chamado_reaberto' : 'chamado_atualizado',
          facts: { id: ticket.id, titulo: ticket.title },
          blocks: [{ type: 'ticket_card', ticket: ticketCard(ticket, now), lastNote: pend.note }],
        },
      };
    } catch (err) {
      if (err instanceof TicketNotReopenableError) {
        trace.override(`${pend.ticketId} não pode mais ser reaberto.`);
        return {
          pending: null,
          outcome: { kind: 'nao_pode_reabrir', facts: { id: pend.ticketId }, blocks: [quick([{ label: 'Abrir um novo chamado', value: 'Quero abrir um novo chamado sobre isso' }])] },
        };
      }
      if (err instanceof TicketNotFoundError) {
        return { pending: null, outcome: { kind: 'chamado_nao_encontrado', facts: {}, blocks: [] } };
      }
      if (err instanceof TicketServiceUnavailableError) return this.unavailable(t, 'atualizar o chamado', pend);
      throw err;
    }
  }

  private async actTransfer(t: Turn, d: Decision, reason: TransferReason): Promise<ActResult> {
    const pend = t.conv.pending;
    const focusId = d.ticketRef ?? (pend?.kind === 'confirm_update' ? pend.ticketId : null);
    const focus = focusId ? t.tickets?.find((x) => x.id === focusId) : undefined;
    let finalReason = reason;
    if (reason === 'pedido_do_funcionario' && focus && getSla(focus, t.now).overdue) finalReason = 'chamado_vencido';

    const summary =
      d.caseSummary ??
      [`Funcionário relatou: ${t.history.filter((m) => m.role === 'user').slice(-2).map((m) => m.content).join(' | ')}`, `Última mensagem: ${t.text}`]
        .filter(Boolean)
        .join('. ');
    const block = await this.doTransfer(t, finalReason, summary, focus && isOpen(focus) ? focus.id : null);
    return {
      pending: null,
      outcome: {
        kind: 'transferido',
        facts: {
          motivo: REASON_TEXT[finalReason],
          faltouSegurancaDoAgent: finalReason === 'baixa_confianca',
        },
        blocks: [block],
      },
    };
  }

  /** Marca a conversa como aguardando atendente. A partir daqui o agent para de responder. */
  private async doTransfer(t: Turn, reason: TransferReason, summary: string, ticketId: string | null): Promise<UiBlock> {
    if (ticketId && t.tickets) {
      try {
        await this.callTickets(t.trace, 'marcar chamado', () => this.deps.tickets.markTransferred(t.userEmail, ticketId, summary));
      } catch {
        t.trace.add('transferiu', 'não consegui marcar o chamado', `O ${ticketId} não pôde ser marcado agora; a conversa foi transferida mesmo assim.`, { status: 'aviso' });
      }
    }
    this.deps.conversations.markHandoff(t.conv.id, reason, summary, ticketId);
    t.trace.add('transferiu', 'transferiu para um analista', `Motivo: ${REASON_TEXT[reason]}. Resumo enviado: ${summary}`, { data: { reason } });
    return { type: 'handoff', reason, summary };
  }

  private unavailable(t: Turn, action: string, keepPending: Pending | null = t.conv.pending): ActResult {
    t.trace.add('aplicou_regra', 'sistema de chamados indisponível', `Não consegui ${action} agora, nem depois de tentar de novo.`, { status: 'erro' });
    return {
      pending: keepPending,
      outcome: {
        kind: 'sistema_indisponivel',
        facts: { acao: action },
        blocks: [quick([{ label: 'Tentar de novo', value: 'Tenta de novo, por favor' }, ANALYST_OPTION])],
      },
    };
  }

  /** Chama o legado com retry. Cada nova tentativa aparece na trilha. */
  private callTickets<T>(trace: TraceBuilder, what: string, fn: () => Promise<T>): Promise<T> {
    return withRetry(fn, {
      ...(this.deps.sleep ? { sleep: this.deps.sleep } : {}),
      onRetry: (attempt) =>
        trace.add('tentou_novamente', 'tentou de novo o sistema de chamados', `${what}: indisponível, nova tentativa (${attempt + 1}/3).`, {
          status: 'aviso',
        }),
    });
  }
}

// ---------- ajudantes ----------

function describeDraft(d: PartialDraft): string {
  const parts: string[] = [];
  if (d.type) parts.push(`tipo ${d.type}`);
  if (d.category) parts.push(`categoria ${d.category}`);
  if (d.title) parts.push(`título "${d.title}"`);
  if (d.affected) parts.push(`afetado: ${d.affected}`);
  if (d.blocksWork !== null) parts.push(d.blocksWork ? 'impede de trabalhar' : 'não impede de trabalhar');
  if (d.commitmentToday) parts.push('compromisso hoje');
  if (d.workStopped) parts.push('algo parado');
  return parts.length ? parts.join('; ') : 'ainda sem dados do chamado';
}

/** Uma pergunta por vez, na ordem que mais afeta o chamado. */
function askFor(missing: MissingField[]): { question: string; options: Array<{ label: string; value: string }> } {
  if (missing.includes('afetado')) {
    return {
      question: 'Quem está sendo afetado por isso?',
      options: [
        { label: 'Só eu', value: 'Só eu estou afetado' },
        { label: 'Minha equipe', value: 'Minha equipe está afetada' },
        { label: 'A empresa toda', value: 'A empresa toda está afetada' },
      ],
    };
  }
  if (missing.includes('impacto')) {
    return {
      question: 'Isso te impede de trabalhar hoje?',
      options: [
        { label: 'Não consigo trabalhar', value: 'Isso me impede de trabalhar' },
        { label: 'Consigo, mas atrapalha', value: 'Consigo trabalhar, mas atrapalha' },
        { label: 'Tenho compromisso hoje', value: 'Tenho um compromisso hoje que depende disso' },
      ],
    };
  }
  if (missing.includes('categoria')) {
    return {
      question: 'Isso é mais sobre qual assunto?',
      options: ['Acesso', 'Rede e VPN', 'Hardware', 'Software', 'E-mail', 'Outros'].map((c) => ({ label: c, value: `É sobre ${c}` })),
    };
  }
  return { question: 'Pode me contar um pouco mais sobre o que está acontecendo?', options: [] };
}
