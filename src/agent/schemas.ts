import { z } from 'zod';
import { AFFECTED, CATEGORIES, TICKET_TYPES } from '../domain/types';
import type { ConversationStatus, ModelCall, TraceStep, TurnTrace, UiBlock } from '../domain/conversation';

export const INTENTS = [
  'saudacao',
  'duvida',
  'consultar_chamado',
  'abrir_chamado',
  'atualizar_chamado',
  'falar_com_analista',
  'confirmar',
  'fora_de_escopo',
  'outro',
] as const;
export type Intent = (typeof INTENTS)[number];

const DraftSchema = z.object({
  type: z.enum(TICKET_TYPES).nullable().describe('INC = algo parou/não funciona. REQ = pedido de acesso, equipamento ou software.'),
  title: z.string().nullable().describe('Título curto e específico do chamado.'),
  description: z.string().nullable().describe('Descrição completa, para o analista não precisar perguntar de novo.'),
  category: z.enum(CATEGORIES).nullable(),
  affected: z.enum(AFFECTED).nullable().describe('solicitante = só o funcionário; equipe; empresa.'),
  blocksWork: z.boolean().nullable().describe('O problema impede o funcionário de trabalhar? null se não foi dito.'),
  commitmentToday: z.boolean().nullable().describe('Há um compromisso hoje em risco? null se não foi dito.'),
  workStopped: z.boolean().nullable().describe('Algo está parado para a equipe ou a empresa? null se não foi dito.'),
});

export const DecisionSchema = z.object({
  understanding: z.string().describe('O que o funcionário quer, em 1 ou 2 frases.'),
  intent: z.enum(INTENTS),
  confidence: z.number().describe('0 a 1: quão seguro você está desta decisão.'),
  reasoning: z.string().describe('Por que escolheu esta intenção e estes campos, em 1 ou 2 frases.'),
  searchQuery: z.string().nullable().describe('Só para intent=duvida: 2 a 6 palavras-chave para a central de ajuda.'),
  ticketRef: z.string().nullable().describe('Número do chamado (INC-/REQ-) a que a mensagem se refere, escolhido da lista do funcionário.'),
  duplicateOf: z.string().nullable().describe('Se o problema relatado é o MESMO de um chamado aberto (ou resolvido há até 7 dias) da lista, o número dele.'),
  confirmation: z.enum(['sim', 'nao', 'ajustar']).nullable().describe('Só para intent=confirmar.'),
  draft: DraftSchema.nullable().describe('Tudo que já se sabe do chamado a abrir (junte o histórico e a mensagem atual).'),
  updateNote: z.string().nullable().describe('Para atualizar_chamado: a informação nova a registrar.'),
  caseSummary: z.string().nullable().describe('Resumo do caso em 2 a 3 frases, para um analista que não leu a conversa.'),
});
export type Decision = z.infer<typeof DecisionSchema>;

// ---------- Eventos que o agent emite (a etapa 3 transforma em SSE) ----------

export type AgentEvent =
  | { type: 'step'; step: TraceStep }
  | { type: 'text'; delta: string }
  | { type: 'blocks'; blocks: UiBlock[] }
  | {
      type: 'done';
      messageId: string;
      text: string;
      blocks: UiBlock[];
      trace: TurnTrace;
      conversationStatus: ConversationStatus;
      userMessageCount: number;
    }
  | { type: 'silenced'; conversationStatus: ConversationStatus }
  | { type: 'limit_reached'; limit: number };

export interface DeciderResult {
  decision: Decision;
  call: ModelCall;
}
