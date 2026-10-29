import { canReopen, getSla } from '../domain/rules';
import { SLA_LABEL } from '../domain/sla';
import type { QuickReply, TicketCardData, UiBlock } from '../domain/conversation';
import type { Ticket } from '../domain/types';
import { formatDue } from './format';

export function ticketCard(t: Ticket, now: Date): TicketCardData {
  const sla = getSla(t, now);
  return {
    id: t.id,
    type: t.type,
    title: t.title,
    description: t.description,
    category: t.category,
    priority: t.priority,
    status: t.status,
    updatedAt: t.updatedAt,
    resolvedAt: t.resolvedAt,
    dueAt: sla.dueAt,
    dueLabel: sla.dueAt ? formatDue(sla.dueAt) : null,
    overdue: sla.overdue,
    slaLabel: SLA_LABEL[t.priority],
    reopenable: canReopen(t, now),
  };
}

export const quick = (options: QuickReply[], question: string | null = null): UiBlock => ({
  type: 'quick_replies',
  question,
  options,
});

export const CONFIRM_CREATE: QuickReply[] = [
  { label: 'Confirmar', value: 'Sim, pode abrir' },
  { label: 'Editar', value: 'Quero ajustar o rascunho' },
  { label: 'Cancelar', value: 'Não, cancela' },
];

export const CONFIRM_UPDATE: QuickReply[] = [
  { label: 'Confirmar', value: 'Sim, pode atualizar' },
  { label: 'Editar', value: 'Quero ajustar o texto' },
  { label: 'Cancelar', value: 'Não, cancela' },
];

export const START_OPTIONS: QuickReply[] = [
  { label: 'Estou com um problema', value: 'Estou com um problema de TI' },
  { label: 'Ver meus chamados', value: 'Quero ver meus chamados' },
  { label: 'Tirar uma dúvida', value: 'Tenho uma dúvida de TI' },
];

export const ANALYST_OPTION: QuickReply = { label: 'Falar com um analista', value: 'Quero falar com um analista' };
