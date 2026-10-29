import { computeDueAt } from './sla';
import type { Ticket, TicketStatus } from './types';

export const REOPEN_WINDOW_DAYS = 7;

const OPEN_STATUSES: readonly TicketStatus[] = ['aberto', 'em_andamento', 'aguardando_analista', 'aprovado'];
const SLA_TRACKED: readonly TicketStatus[] = ['aberto', 'em_andamento', 'aguardando_analista'];

export const isOpen = (t: Pick<Ticket, 'status'>): boolean => OPEN_STATUSES.includes(t.status);

export function canReopen(t: Ticket, now: Date): boolean {
  if (t.status !== 'resolvido' || !t.resolvedAt) return false;
  const ageMs = now.getTime() - new Date(t.resolvedAt).getTime();
  return ageMs <= REOPEN_WINDOW_DAYS * 24 * 60 * 60_000;
}

export interface SlaStatus {
  tracked: boolean;
  dueAt: string | null;
  overdue: boolean;
}

export function getSla(t: Ticket, now: Date): SlaStatus {
  if (!SLA_TRACKED.includes(t.status)) return { tracked: false, dueAt: null, overdue: false };
  const due = computeDueAt(t.priority, new Date(t.updatedAt));
  return { tracked: true, dueAt: due.toISOString(), overdue: now.getTime() > due.getTime() };
}
