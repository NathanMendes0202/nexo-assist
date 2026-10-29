import { ticketCard } from '../agent/blocks';
import { isOpen } from '../domain/rules';
import type { Employee } from '../domain/types';
import type { Conversation, ConversationStore } from '../services/conversations';
import { findEmployee } from '../services/seed';
import { withRetry } from '../services/tickets/resilience';
import type { TicketService } from '../services/tickets/ticket-service';
import { initials } from '../ui/format';
import type { ConsoleDetailPayload, ConsoleListItem, ConsoleListPayload, PersonView, Tone } from '../ui/console/types';
import { toClientMessage } from './payload';

const person = (email: string): PersonView => {
  const e = findEmployee(email);
  const name = e?.name ?? email;
  return { name, email, department: e?.department ?? '', initials: initials(name) };
};

const firstName = (n: string): string => n.split(' ')[0] ?? n;

/** Ordem da lista: quem precisa de uma pessoa primeiro, depois o que está em atendimento, depois o resto. */
const RANK: Record<Conversation['status'], number> = { aguardando_atendente: 0, com_analista: 1, com_agent: 2, encerrada: 3 };

function tagFor(conv: Conversation, analyst: Employee, confidence: number | null): { tone: Tone; label: string } {
  switch (conv.status) {
    case 'aguardando_atendente': {
      const ticket = conv.ticketId ? ` · ${conv.ticketId}` : '';
      switch (conv.handoff?.reason) {
        case 'baixa_confianca':
          return { tone: 'warning', label: `Agent pediu ajuda${confidence !== null ? ` · confiança ${Math.round(confidence * 100)}%` : ''}` };
        case 'caso_critico':
          return { tone: 'danger', label: `Crítico · transferida${ticket}` };
        case 'chamado_vencido':
          return { tone: 'danger', label: `Transferida${ticket} · prazo vencido` };
        case 'erro_no_sistema':
          return { tone: 'warning', label: 'Transferida · sistema instável' };
        default:
          return { tone: 'danger', label: `Transferida${ticket}` };
      }
    }
    case 'com_analista': {
      const mine = conv.assignedAnalyst === analyst.email;
      const who = conv.assignedAnalyst ? firstName(person(conv.assignedAnalyst).name) : 'analista';
      return { tone: 'violet', label: mine ? 'Com você' : `Com ${who}` };
    }
    case 'com_agent':
      return { tone: 'success', label: 'Agent atendendo' };
    case 'encerrada':
      return { tone: 'muted', label: 'Encerrada' };
  }
}

export function buildList(conversations: ConversationStore, analyst: Employee): ConsoleListPayload {
  const all = conversations.listAll();
  const items: ConsoleListItem[] = all.map((conv) => {
    const last = conversations.lastMessage(conv.id);
    const lastAgentTrace = [...conversations.recentMessages(conv.id, 12)].reverse().find((m) => m.role === 'agent' && m.trace)?.trace;
    const from: ConsoleListItem['preview']['from'] = last?.role === 'agent' || last?.role === 'analyst' ? last.role : 'user';
    const prefix = from === 'agent' ? 'Nexo: ' : from === 'analyst' ? 'Atendente: ' : '';
    return {
      id: conv.id,
      customer: person(conv.userEmail),
      status: conv.status,
      tag: tagFor(conv, analyst, lastAgentTrace?.confidence ?? null),
      preview: { text: `${prefix}${last?.content ?? 'Conversa iniciada'}`, from },
      at: last?.createdAt ?? conv.updatedAt,
      needsAttention: conv.status === 'aguardando_atendente',
      assignedToMe: conv.status === 'com_analista' && conv.assignedAnalyst === analyst.email,
    };
  });
  items.sort((a, b) => RANK[a.status] - RANK[b.status] || b.at.localeCompare(a.at));

  return {
    items,
    counts: {
      paraVoce: items.filter((i) => i.status === 'aguardando_atendente').length,
      comAgent: items.filter((i) => i.status === 'com_agent').length,
      minhas: items.filter((i) => i.assignedToMe).length,
    },
    analyst: { name: analyst.name, email: analyst.email, level: analyst.analystLevel ?? null, initials: initials(analyst.name) },
  };
}

export async function buildDetail(
  deps: { conversations: ConversationStore; tickets: TicketService; confidenceThreshold: number; now?: Date },
  analyst: Employee,
  conv: Conversation,
): Promise<ConsoleDetailPayload> {
  const now = deps.now ?? new Date();
  const mine = conv.assignedAnalyst === analyst.email;
  const customer = person(conv.userEmail);

  let tickets: ConsoleDetailPayload['tickets'] = null;
  try {
    const list = await withRetry(() => deps.tickets.listForAnalyst(analyst, conv.userEmail));
    tickets = {
      linked: (() => {
        const t = list.find((x) => x.id === conv.ticketId);
        return t ? ticketCard(t, now) : null;
      })(),
      others: list.filter((x) => x.id !== conv.ticketId).map((x) => ticketCard(x, now)),
      openCount: list.filter(isOpen).length,
      closedCount: list.filter((x) => !isOpen(x)).length,
    };
  } catch {
    tickets = null; // o painel mostra "sistema instável" e a conversa continua utilizável
  }

  const assigned = conv.assignedAnalyst ? findEmployee(conv.assignedAnalyst) : undefined;
  return {
    conversation: {
      id: conv.id,
      status: conv.status,
      handoff: conv.handoff,
      assignedTo: assigned ? { name: assigned.name, level: assigned.analystLevel ?? null, isMe: mine } : null,
      ticketId: conv.ticketId,
      closedAt: conv.closedAt,
    },
    customer,
    messages: deps.conversations.messages(conv.id).map(toClientMessage),
    tickets,
    permissions: {
      canAssume: conv.status === 'aguardando_atendente',
      canReturn: conv.status === 'aguardando_atendente' || (conv.status === 'com_analista' && mine),
      canClose: conv.status === 'com_analista' && mine,
      canReply: conv.status === 'com_analista' && mine,
    },
    confidenceThreshold: deps.confidenceThreshold,
  };
}
