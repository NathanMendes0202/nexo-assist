import type { ConversationStatus, TicketCardData, TransferReason } from '../../domain/conversation';
import type { ClientMessage } from '../types';

export type Tone = 'danger' | 'warning' | 'violet' | 'success' | 'muted';
export type FilterKey = 'todas' | 'para_voce' | 'com_agent' | 'minhas';

export interface PersonView {
  name: string;
  email: string;
  department: string;
  initials: string;
}

export interface ConsoleListItem {
  id: string;
  customer: PersonView;
  status: ConversationStatus;
  tag: { tone: Tone; label: string };
  preview: { text: string; from: 'user' | 'agent' | 'analyst' };
  at: string;
  needsAttention: boolean;
  assignedToMe: boolean;
}

export interface ConsoleListPayload {
  items: ConsoleListItem[];
  counts: { paraVoce: number; comAgent: number; minhas: number };
  analyst: { name: string; email: string; level: string | null; initials: string };
}

export interface ConsoleDetailPayload {
  conversation: {
    id: string;
    status: ConversationStatus;
    handoff: { reason: TransferReason; summary: string; at: string } | null;
    assignedTo: { name: string; level: string | null; isMe: boolean } | null;
    ticketId: string | null;
    closedAt: string | null;
  };
  customer: PersonView;
  messages: ClientMessage[];
  /** null = o sistema de chamados não respondeu; a interface mostra um aviso e permite tentar de novo. */
  tickets: {
    linked: TicketCardData | null;
    others: TicketCardData[];
    openCount: number;
    closedCount: number;
  } | null;
  permissions: { canAssume: boolean; canReturn: boolean; canClose: boolean; canReply: boolean };
  confidenceThreshold: number;
}
