import { canReopen, isOpen } from '../../domain/rules';
import {
  AFFECTED,
  CATEGORIES,
  PRIORITIES,
  TICKET_TYPES,
  type Category,
  type Clock,
  type Employee,
  type EventKind,
  type NewTicketInput,
  type Ticket,
  type TicketDetail,
  type TicketEvent,
  type TicketType,
} from '../../domain/types';
import type { Db } from '../db';
import {
  TicketAccessDeniedError,
  InvalidTicketInputError,
  TicketNotFoundError,
  TicketNotReopenableError,
  TicketServiceUnavailableError,
} from './errors';

interface TicketRow {
  id: string;
  type: Ticket['type'];
  title: string;
  description: string;
  category: Ticket['category'];
  priority: Ticket['priority'];
  status: Ticket['status'];
  affected: Ticket['affected'];
  requester_email: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface EventRow {
  at: string;
  kind: EventKind;
  actor: string;
  note: string;
}

const toTicket = (r: TicketRow): Ticket => ({
  id: r.id,
  type: r.type,
  title: r.title,
  description: r.description,
  category: r.category,
  priority: r.priority,
  status: r.status,
  affected: r.affected,
  requesterEmail: r.requester_email,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  resolvedAt: r.resolved_at,
});

export interface TicketServiceOptions {
  clock?: Clock;
  unavailableRate?: number;
  random?: () => number;
}

export class TicketService {
  private readonly clock: Clock;
  private readonly unavailableRate: number;
  private readonly random: () => number;

  constructor(
    private readonly db: Db,
    opts: TicketServiceOptions = {},
  ) {
    this.clock = opts.clock ?? (() => new Date());
    this.unavailableRate = opts.unavailableRate ?? 0;
    this.random = opts.random ?? Math.random;
  }

  async listByRequester(requesterEmail: string, filter: { onlyOpen?: boolean } = {}): Promise<Ticket[]> {
    this.maybeFail();
    const rows = this.db
      .prepare('SELECT * FROM tickets WHERE requester_email = ? ORDER BY updated_at DESC')
      .all(norm(requesterEmail)) as TicketRow[];
    const tickets = rows.map(toTicket);
    return filter.onlyOpen ? tickets.filter(isOpen) : tickets;
  }

  async getById(requesterEmail: string, ticketId: string): Promise<TicketDetail> {
    this.maybeFail();
    const ticket = this.mustOwn(requesterEmail, ticketId);
    return { ...ticket, events: this.eventsOf(ticketId) };
  }

  async findRelated(
    requesterEmail: string,
    category: Category,
  ): Promise<{ open: Ticket[]; reopenable: Ticket[] }> {
    this.maybeFail();
    const now = this.clock();
    const rows = this.db
      .prepare('SELECT * FROM tickets WHERE requester_email = ? AND category = ? ORDER BY updated_at DESC')
      .all(norm(requesterEmail), category) as TicketRow[];
    const tickets = rows.map(toTicket);
    return {
      open: tickets.filter(isOpen),
      reopenable: tickets.filter((t) => canReopen(t, now)),
    };
  }

  async create(requesterEmail: string, input: NewTicketInput): Promise<Ticket> {
    this.maybeFail();
    validate(input);
    const now = this.clock().toISOString();
    const email = norm(requesterEmail);

    const insert = this.db.transaction((): string => {
      const id = this.nextId(input.type);
      this.db
        .prepare(
          `INSERT INTO tickets (id, type, title, description, category, priority, status, affected,
                                requester_email, created_at, updated_at, resolved_at)
           VALUES (?, ?, ?, ?, ?, ?, 'aberto', ?, ?, ?, ?, NULL)`,
        )
        .run(id, input.type, input.title.trim(), input.description.trim(), input.category, input.priority, input.affected, email, now, now);
      this.addEvent(id, { at: now, kind: 'criado', actor: 'agent', note: 'Chamado aberto pelo Nexo Assist.' });
      return id;
    });
    return this.mustOwn(email, insert());
  }

  async addUpdate(
    requesterEmail: string,
    ticketId: string,
    input: { note: string; actor?: string },
  ): Promise<{ ticket: Ticket; reopened: boolean }> {
    this.maybeFail();
    const note = input.note.trim();
    if (!note) throw new InvalidTicketInputError(['a informação nova está vazia']);

    const current = this.mustOwn(requesterEmail, ticketId);
    const nowDate = this.clock();
    const now = nowDate.toISOString();
    const actor = input.actor ?? 'agent';

    let reopened = false;
    if (!isOpen(current)) {
      if (!canReopen(current, nowDate)) throw new TicketNotReopenableError(ticketId);
      reopened = true;
    }

    this.db.transaction(() => {
      this.db
        .prepare(`UPDATE tickets SET updated_at = ?, status = ?, resolved_at = ? WHERE id = ?`)
        .run(now, reopened ? 'aberto' : current.status, reopened ? null : current.resolvedAt, ticketId);
      this.addEvent(ticketId, { at: now, kind: reopened ? 'reaberto' : 'atualizado', actor, note });
    })();

    return { ticket: this.mustOwn(requesterEmail, ticketId), reopened };
  }

  async markTransferred(requesterEmail: string, ticketId: string, summary: string): Promise<Ticket> {
    this.maybeFail();
    this.mustOwn(requesterEmail, ticketId);
    const now = this.clock().toISOString();
    this.db.transaction(() => {
      this.db.prepare(`UPDATE tickets SET status = 'aguardando_analista', updated_at = ? WHERE id = ?`).run(now, ticketId);
      this.addEvent(ticketId, { at: now, kind: 'transferido', actor: 'agent', note: summary });
    })();
    return this.mustOwn(requesterEmail, ticketId);
  }
  async listForAnalyst(analyst: Pick<Employee, 'role'>, customerEmail: string): Promise<Ticket[]> {
    this.requireAnalyst(analyst);
    this.maybeFail();
    const rows = this.db
      .prepare('SELECT * FROM tickets WHERE requester_email = ? ORDER BY updated_at DESC')
      .all(norm(customerEmail)) as TicketRow[];
    return rows.map(toTicket);
  }

  async analystTake(analyst: Pick<Employee, 'role' | 'email' | 'name'>, ticketId: string): Promise<Ticket | null> {
    this.requireAnalyst(analyst);
    this.maybeFail();
    const row = this.db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId) as TicketRow | undefined;
    if (!row) return null;
    const now = this.clock().toISOString();
    this.db.transaction(() => {
      this.db.prepare(`UPDATE tickets SET status = 'em_andamento', updated_at = ? WHERE id = ?`).run(now, ticketId);
      this.addEvent(ticketId, { at: now, kind: 'atualizado', actor: analyst.email, note: `Assumido por ${analyst.name}.` });
    })();
    return toTicket(this.db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId) as TicketRow);
  }

  // ---- internos ----

  private requireAnalyst(analyst: Pick<Employee, 'role'>): void {
    if (analyst.role !== 'analista') throw new TicketAccessDeniedError();
  }


  private maybeFail(): void {
    if (this.unavailableRate > 0 && this.random() < this.unavailableRate) {
      throw new TicketServiceUnavailableError();
    }
  }

  private mustOwn(requesterEmail: string, ticketId: string): Ticket {
    const row = this.db
      .prepare('SELECT * FROM tickets WHERE id = ? AND requester_email = ?')
      .get(ticketId, norm(requesterEmail)) as TicketRow | undefined;
    if (!row) throw new TicketNotFoundError(ticketId);
    return toTicket(row);
  }

  private eventsOf(ticketId: string): TicketEvent[] {
    return this.db
      .prepare('SELECT at, kind, actor, note FROM ticket_events WHERE ticket_id = ? ORDER BY at, id')
      .all(ticketId) as EventRow[];
  }

  private addEvent(ticketId: string, e: TicketEvent): void {
    this.db
      .prepare('INSERT INTO ticket_events (ticket_id, at, kind, actor, note) VALUES (?, ?, ?, ?, ?)')
      .run(ticketId, e.at, e.kind, e.actor, e.note);
  }

  private nextId(type: TicketType): string {
    const row = this.db
      .prepare('SELECT MAX(CAST(SUBSTR(id, 5) AS INTEGER)) AS n FROM tickets WHERE type = ?')
      .get(type) as { n: number | null };
    const base = type === 'INC' ? 20000 : 10000;
    return `${type}-${(row.n ?? base) + 1}`;
  }
}

const norm = (email: string): string => email.trim().toLowerCase();

function validate(input: NewTicketInput): void {
  const problems: string[] = [];
  if (!input.title?.trim()) problems.push('falta o título');
  if (!input.description?.trim()) problems.push('falta a descrição');
  if (!TICKET_TYPES.includes(input.type)) problems.push('tipo inválido');
  if (!CATEGORIES.includes(input.category)) problems.push('categoria inválida');
  if (!PRIORITIES.includes(input.priority)) problems.push('prioridade inválida');
  if (!AFFECTED.includes(input.affected)) problems.push('falta informar quem é afetado');
  if (problems.length) throw new InvalidTicketInputError(problems);
}
