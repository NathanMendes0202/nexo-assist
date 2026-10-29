// Tipos compartilhados entre agent, persistência e (na etapa 3) a interface.
import type { Affected, Category, Priority, TicketStatus, TicketType } from './types';

export type ConversationStatus = 'com_agent' | 'aguardando_atendente' | 'com_analista' | 'encerrada';

export type TransferReason =
  | 'pedido_do_funcionario'
  | 'caso_critico'
  | 'chamado_vencido'
  | 'baixa_confianca'
  | 'erro_no_sistema';

export interface PartialDraft {
  type: TicketType | null;
  title: string | null;
  description: string | null;
  category: Category | null;
  affected: Affected | null;
  blocksWork: boolean | null;
  commitmentToday: boolean | null;
  workStopped: boolean | null;
}

export interface CompleteDraft {
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  affected: Affected;
  blocksWork: boolean;
  commitmentToday: boolean;
  workStopped: boolean;
}

export type Pending =
  | { kind: 'collecting_ticket'; draft: PartialDraft }
  | { kind: 'confirm_create'; draft: CompleteDraft; priority: Priority; priorityReason: string }
  | { kind: 'confirm_update'; ticketId: string; note: string; reopen: boolean };

export interface TicketCardData {
  id: string;
  type: TicketType;
  title: string;
  description: string;
  category: Category;
  priority: Priority;
  status: TicketStatus;
  updatedAt: string;
  resolvedAt: string | null;
  dueAt: string | null;
  dueLabel: string | null;
  overdue: boolean;
  slaLabel: string;
  reopenable: boolean;
}

export interface QuickReply {
  label: string;
  value: string;
}

export type UiBlock =
  | { type: 'ticket_cards'; tickets: TicketCardData[]; selectable: boolean }
  | { type: 'ticket_card'; ticket: TicketCardData; lastNote: string | null }
  | {
      type: 'draft';
      kind: 'create' | 'update';
      ticketType?: TicketType;
      title?: string;
      description: string;
      category?: Category;
      affected?: Affected;
      priority?: Priority;
      priorityReason?: string;
      dueLabel?: string;
      slaLabel?: string;
      ticketId?: string;
      reopen?: boolean;
    }
  | { type: 'quick_replies'; question: string | null; options: QuickReply[] }
  | { type: 'handoff'; reason: TransferReason; summary: string };


export type StepKind =
  | 'carregou_contexto'
  | 'consultou_chamados'
  | 'buscou_central'
  | 'verificou_duplicidade'
  | 'classificou_prioridade'
  | 'consultou_prazo'
  | 'preparou_rascunho'
  | 'pediu_informacao'
  | 'criou_chamado'
  | 'atualizou_chamado'
  | 'reabriu_chamado'
  | 'transferiu'
  | 'recusou_fora_de_escopo'
  | 'tentou_novamente'
  | 'aplicou_regra';

export interface TraceStep {
  kind: StepKind;
  label: string;
  detail: string;
  status: 'ok' | 'aviso' | 'erro';
  visible: boolean;
  at: string;
  data?: unknown;
}

export interface ModelCall {
  model: string;
  ms: number;
  inputTokens?: number;
  outputTokens?: number;
}

export type OutcomeKind =
  | 'saudacao'
  | 'duvida_respondida'
  | 'duvida_sem_artigo'
  | 'chamados_listados'
  | 'chamado_detalhado'
  | 'chamado_nao_encontrado'
  | 'pedindo_informacao'
  | 'rascunho_proposto'
  | 'atualizacao_proposta'
  | 'chamado_criado'
  | 'chamado_atualizado'
  | 'chamado_reaberto'
  | 'nao_pode_reabrir'
  | 'confirmacao_negada'
  | 'nada_a_confirmar'
  | 'transferido'
  | 'fora_de_escopo'
  | 'sistema_indisponivel'
  | 'conversa_geral'
  | 'erro_interno';

export interface TurnTrace {
  turnId: string;
  startedAt: string;
  durationMs: number;
  understanding: string;
  intent: string;
  confidence: number;
  reasoning: string;
  steps: TraceStep[];
  overrides: string[];
  outcome: OutcomeKind;
  models: { decider?: ModelCall; responder?: ModelCall };
}
