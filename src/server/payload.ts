import type { Conversation, ConversationStore, StoredMessage } from '../services/conversations';
import { findEmployee } from '../services/seed';
import type { Employee } from '../domain/types';
import type { ClientMessage, ConversationPayload } from '../ui/types';

export function toClientMessage(m: StoredMessage): ClientMessage {
  const author = m.authorEmail ? findEmployee(m.authorEmail) : undefined;
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    blocks: m.blocks,
    trace: m.trace,
    ...(author ? { author: { name: author.name, level: author.analystLevel ?? null } } : {}),
    createdAt: m.createdAt,
  };
}

export function buildPayload(
  conv: Conversation,
  conversations: ConversationStore,
  user: Employee,
  config: { messageLimit: number; confidenceThreshold: number },
): ConversationPayload {
  return {
    conversation: { id: conv.id, status: conv.status, handoff: conv.handoff },
    messages: conversations.messages(conv.id).map(toClientMessage),
    userMessageCount: conversations.userMessageCount(conv.id),
    limit: config.messageLimit,
    confidenceThreshold: config.confidenceThreshold,
    user: { name: user.name, email: user.email },
  };
}
