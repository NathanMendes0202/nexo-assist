import { randomUUID } from 'node:crypto';
import type { ConversationStatus, Pending, TransferReason, TurnTrace, UiBlock } from '../domain/conversation';
import type { Clock } from '../domain/types';
import type { Db } from './db';

export class ConversationNotFoundError extends Error {
  constructor(id: string) {
    super(`Conversa ${id} não encontrada.`);
    this.name = 'ConversationNotFoundError';
  }
}

export class ConversationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConversationStateError';
  }
}

export class ConversationBusyError extends Error {
  constructor() {
    super('Você já tem um atendimento com um analista em andamento. Termine por lá antes de começar outro.');
    this.name = 'ConversationBusyError';
  }
}

export interface Handoff {
  reason: TransferReason;
  summary: string;
  at: string;
}

export interface Conversation {
  id: string;
  userEmail: string;
  status: ConversationStatus;
  title: string | null;
  pending: Pending | null;
  handoff: Handoff | null;
  assignedAnalyst: string | null;
  ticketId: string | null;
  closedAt: string | null;
  closedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MessageRole = 'user' | 'agent' | 'analyst' | 'system';

export interface StoredMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  blocks: UiBlock[];
  trace: TurnTrace | null;
  authorEmail: string | null;
  createdAt: string;
}

interface ConversationRow {
  id: string;
  user_email: string;
  status: ConversationStatus;
  title: string | null;
  pending_json: string | null;
  handoff_reason: TransferReason | null;
  handoff_summary: string | null;
  handoff_at: string | null;
  assigned_analyst: string | null;
  ticket_id: string | null;
  closed_at: string | null;
  closed_by: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  blocks_json: string | null;
  trace_json: string | null;
  author_email: string | null;
  created_at: string;
}

const toConversation = (r: ConversationRow): Conversation => ({
  id: r.id,
  userEmail: r.user_email,
  status: r.status,
  title: r.title,
  pending: r.pending_json ? (JSON.parse(r.pending_json) as Pending) : null,
  handoff:
    r.handoff_reason && r.handoff_summary && r.handoff_at
      ? { reason: r.handoff_reason, summary: r.handoff_summary, at: r.handoff_at }
      : null,
  assignedAnalyst: r.assigned_analyst,
  ticketId: r.ticket_id,
  closedAt: r.closed_at,
  closedBy: r.closed_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toMessage = (r: MessageRow): StoredMessage => ({
  id: r.id,
  conversationId: r.conversation_id,
  role: r.role,
  content: r.content,
  blocks: r.blocks_json ? (JSON.parse(r.blocks_json) as UiBlock[]) : [],
  trace: r.trace_json ? (JSON.parse(r.trace_json) as TurnTrace) : null,
  authorEmail: r.author_email,
  createdAt: r.created_at,
});

export class ConversationStore {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock = () => new Date(),
  ) {}

  create(userEmail: string): Conversation {
    const id = randomUUID();
    const now = this.clock().toISOString();
    this.db
      .prepare(
        `INSERT INTO conversations (id, user_email, status, created_at, updated_at)
         VALUES (?, ?, 'com_agent', ?, ?)`,
      )
      .run(id, userEmail.trim().toLowerCase(), now, now);
    return this.mustGet(id);
  }

  startNew(userEmail: string): Conversation {
    const active = this.listByUser(userEmail).filter((c) => c.status !== 'encerrada');
    if (active.some((c) => c.status !== 'com_agent')) throw new ConversationBusyError();
    const now = this.clock().toISOString();
    for (const c of active) {
      this.db
        .prepare(`UPDATE conversations SET status = 'encerrada', closed_at = ?, closed_by = 'funcionario', updated_at = ? WHERE id = ? AND status = 'com_agent'`)
        .run(now, now, c.id);
    }
    return this.create(userEmail);
  }

  getOwned(id: string, userEmail: string): Conversation {
    const c = this.get(id);
    if (!c || c.userEmail !== userEmail.trim().toLowerCase()) throw new ConversationNotFoundError(id);
    return c;
  }

  get(id: string): Conversation | undefined {
    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConversationRow | undefined;
    return row ? toConversation(row) : undefined;
  }

  listByUser(userEmail: string): Conversation[] {
    const rows = this.db
      .prepare('SELECT * FROM conversations WHERE user_email = ? ORDER BY updated_at DESC')
      .all(userEmail.trim().toLowerCase()) as ConversationRow[];
    return rows.map(toConversation);
  }

  listAll(): Conversation[] {
    const rows = this.db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all() as ConversationRow[];
    return rows.map(toConversation);
  }

  addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    extras: { blocks?: UiBlock[]; trace?: TurnTrace; authorEmail?: string } = {},
  ): StoredMessage {
    const id = randomUUID();
    const now = this.clock().toISOString();
    this.db
      .prepare(
        `INSERT INTO messages (id, conversation_id, role, content, blocks_json, trace_json, author_email, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        conversationId,
        role,
        content,
        extras.blocks?.length ? JSON.stringify(extras.blocks) : null,
        extras.trace ? JSON.stringify(extras.trace) : null,
        extras.authorEmail ?? null,
        now,
      );
    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId);
    const row = this.db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow;
    return toMessage(row);
  }

  messages(conversationId: string): StoredMessage[] {
    const rows = this.db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid')
      .all(conversationId) as MessageRow[];
    return rows.map(toMessage);
  }

  lastMessage(conversationId: string): StoredMessage | undefined {
    const row = this.db
      .prepare("SELECT * FROM messages WHERE conversation_id = ? AND role != 'system' ORDER BY created_at DESC, rowid DESC LIMIT 1")
      .get(conversationId) as MessageRow | undefined;
    return row ? toMessage(row) : undefined;
  }

  recentMessages(conversationId: string, n: number): StoredMessage[] {
    const rows = this.db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?')
      .all(conversationId, n) as MessageRow[];
    return rows.reverse().map(toMessage);
  }

  userMessageCount(conversationId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND role = 'user'")
      .get(conversationId) as { n: number };
    return row.n;
  }

  setPending(conversationId: string, pending: Pending | null): void {
    this.db
      .prepare('UPDATE conversations SET pending_json = ?, updated_at = ? WHERE id = ?')
      .run(pending ? JSON.stringify(pending) : null, this.clock().toISOString(), conversationId);
  }

  markHandoff(conversationId: string, reason: TransferReason, summary: string, ticketId: string | null = null): void {
    const now = this.clock().toISOString();
    this.db
      .prepare(
        `UPDATE conversations
         SET status = 'aguardando_atendente', handoff_reason = ?, handoff_summary = ?, handoff_at = ?,
             ticket_id = COALESCE(?, ticket_id), pending_json = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(reason, summary, now, ticketId, now, conversationId);
  }

  // ---------- ações do analista (estado alterado por UPDATE condicional) ----------
  assume(conversationId: string, analystEmail: string): Conversation {
    const res = this.db
      .prepare(
        `UPDATE conversations SET status = 'com_analista', assigned_analyst = ?, updated_at = ?
         WHERE id = ? AND status = 'aguardando_atendente'`,
      )
      .run(analystEmail.toLowerCase(), this.clock().toISOString(), conversationId) as { changes: number };
    if (res.changes === 0) {
      throw new ConversationStateError('Esta conversa não está mais aguardando atendente (outra pessoa pode ter assumido).');
    }
    return this.mustGet(conversationId);
  }

  returnToAgent(conversationId: string, analystEmail: string): Conversation {
    const res = this.db
      .prepare(
        `UPDATE conversations
         SET status = 'com_agent', assigned_analyst = NULL, handoff_reason = NULL, handoff_summary = NULL,
             handoff_at = NULL, updated_at = ?
         WHERE id = ? AND (status = 'aguardando_atendente' OR (status = 'com_analista' AND assigned_analyst = ?))`,
      )
      .run(this.clock().toISOString(), conversationId, analystEmail.toLowerCase()) as { changes: number };
    if (res.changes === 0) {
      throw new ConversationStateError('Só quem está atendendo pode devolver esta conversa ao agent.');
    }
    return this.mustGet(conversationId);
  }

  close(conversationId: string, analystEmail: string): Conversation {
    const now = this.clock().toISOString();
    const res = this.db
      .prepare(
        `UPDATE conversations SET status = 'encerrada', closed_at = ?, closed_by = ?, updated_at = ?
         WHERE id = ? AND status = 'com_analista' AND assigned_analyst = ?`,
      )
      .run(now, analystEmail.toLowerCase(), now, conversationId, analystEmail.toLowerCase()) as { changes: number };
    if (res.changes === 0) {
      throw new ConversationStateError('Só quem está atendendo pode encerrar esta conversa.');
    }
    return this.mustGet(conversationId);
  }

  private mustGet(id: string): Conversation {
    const c = this.get(id);
    if (!c) throw new ConversationNotFoundError(id);
    return c;
  }
}
