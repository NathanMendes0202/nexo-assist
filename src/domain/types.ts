export const TICKET_TYPES = ['INC', 'REQ'] as const; // incidente | requisição
export type TicketType = (typeof TICKET_TYPES)[number];

export const CATEGORIES = ['Acesso', 'Rede e VPN', 'Hardware', 'Software', 'E-mail', 'Outros'] as const;
export type Category = (typeof CATEGORIES)[number];

export const PRIORITIES = ['Crítica', 'Alta', 'Média', 'Baixa'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = [
  'aberto',
  'em_andamento',
  'aguardando_analista',
  'aprovado',
  'resolvido',
  'encerrado',
] as const;
export type TicketStatus = (typeof STATUSES)[number];

export const AFFECTED = ['solicitante', 'equipe', 'empresa'] as const;
export type Affected = (typeof AFFECTED)[number];

export type EventKind = 'criado' | 'atualizado' | 'reaberto' | 'transferido' | 'resolvido';

export interface TicketEvent {
  at: string; 
  kind: EventKind;
  actor: string; 
  note: string;
}

export interface Ticket {
  id: string; 
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  status: TicketStatus;
  affected: Affected;
  requesterEmail: string;
  createdAt: string;
  updatedAt: string; 
  resolvedAt: string | null;
}

export interface TicketDetail extends Ticket {
  events: TicketEvent[];
}

export interface NewTicketInput {
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  affected: Affected;
}

export interface Employee {
  email: string;
  name: string;
  department: string;
  role: 'funcionario' | 'analista';
  analystLevel?: 'N1' | 'N2';
  device?: { model: string; os: string }; 
}

export interface HelpArticle {
  id: string;
  title: string;
  body: string;
  category: Category;
  keywords: string[];
  limitations?: string;
}

export type Clock = () => Date;
