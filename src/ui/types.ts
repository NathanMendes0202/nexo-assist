import type { ConversationStatus, TraceStep, TransferReason, TurnTrace, UiBlock } from '../domain/conversation';
import type { AgentEvent } from '../agent/schemas';

export interface ClientMessage {
  id: string;
  role: 'user' | 'agent' | 'analyst' | 'system';
  content: string;
  blocks: UiBlock[];
  trace: TurnTrace | null;
  /** Passos recebidos enquanto a resposta ainda está sendo gerada. */
  liveSteps?: TraceStep[];
  streaming?: boolean;
  /** Quem escreveu, para mensagens de analista. */
  author?: { name: string; level: string | null };
  createdAt: string;
}

export interface ConversationPayload {
  conversation: {
    id: string;
    status: ConversationStatus;
    handoff: { reason: TransferReason; summary: string; at: string } | null;
  };
  messages: ClientMessage[];
  userMessageCount: number;
  limit: number;
  confidenceThreshold: number;
  user: { name: string; email: string };
}

export type StreamEvent = AgentEvent | { type: 'error'; message: string };
