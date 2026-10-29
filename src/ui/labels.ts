import type { OutcomeKind, StepKind, TransferReason } from '../domain/conversation';
import type { Affected, TicketStatus } from '../domain/types';

export type Tone = 'warning' | 'primary' | 'success' | 'muted' | 'danger';

export const STATUS_LABEL: Record<TicketStatus, string> = {
  aberto: 'Aberto',
  em_andamento: 'Em andamento',
  aguardando_analista: 'Aguardando analista',
  aprovado: 'Aprovado',
  resolvido: 'Resolvido',
  encerrado: 'Encerrado',
};

export const STATUS_TONE: Record<TicketStatus, Tone> = {
  aberto: 'primary',
  em_andamento: 'primary',
  aguardando_analista: 'warning',
  aprovado: 'success',
  resolvido: 'success',
  encerrado: 'muted',
};

export const AFFECTED_LABEL: Record<Affected, string> = {
  solicitante: 'Só você',
  equipe: 'Sua equipe',
  empresa: 'A empresa toda',
};

export const INTENT_LABEL: Record<string, string> = {
  saudacao: 'Cumprimento',
  duvida: 'Dúvida',
  consultar_chamado: 'Consultar chamado',
  abrir_chamado: 'Abrir chamado',
  atualizar_chamado: 'Atualizar chamado',
  falar_com_analista: 'Falar com um analista',
  confirmar: 'Confirmação',
  fora_de_escopo: 'Fora do escopo de TI',
  outro: 'Não classificado',
  erro: 'Erro interno',
};

export const OUTCOME_LABEL: Record<OutcomeKind, string> = {
  saudacao: 'Apresentou o que sabe fazer',
  duvida_respondida: 'Respondeu com a central de ajuda',
  duvida_sem_artigo: 'Não achou artigo; ofereceu chamado',
  chamados_listados: 'Listou os chamados',
  chamado_detalhado: 'Mostrou o chamado e o prazo',
  chamado_nao_encontrado: 'Chamado não encontrado',
  pedindo_informacao: 'Pediu mais informações',
  rascunho_proposto: 'Montou o rascunho e pediu confirmação',
  atualizacao_proposta: 'Propôs atualizar um chamado existente',
  chamado_criado: 'Criou o chamado',
  chamado_atualizado: 'Atualizou o chamado',
  chamado_reaberto: 'Reabriu o chamado',
  nao_pode_reabrir: 'Não pôde reabrir (passou de 7 dias)',
  confirmacao_negada: 'Cancelou; nada foi alterado',
  nada_a_confirmar: 'Não havia nada para confirmar',
  transferido: 'Transferiu para um analista',
  fora_de_escopo: 'Redirecionou (assunto fora de TI)',
  sistema_indisponivel: 'Sistema de chamados indisponível',
  conversa_geral: 'Pediu para esclarecer',
  erro_interno: 'Erro interno',
};

export const REASON_LABEL: Record<TransferReason, string> = {
  pedido_do_funcionario: 'Você pediu para falar com uma pessoa.',
  caso_critico: 'É um caso crítico.',
  chamado_vencido: 'O chamado está com o prazo vencido.',
  baixa_confianca: 'O assistente não teve segurança para decidir sozinho.',
  erro_no_sistema: 'O sistema de chamados ficou indisponível.',
};

export const STEP_TITLE: Record<StepKind, string> = {
  carregou_contexto: 'Carregou o contexto',
  consultou_chamados: 'Consultou seus chamados',
  buscou_central: 'Buscou na central de ajuda',
  verificou_duplicidade: 'Verificou duplicidade',
  classificou_prioridade: 'Classificou a prioridade',
  consultou_prazo: 'Consultou o prazo',
  preparou_rascunho: 'Preparou o rascunho',
  pediu_informacao: 'Pediu informação',
  criou_chamado: 'Criou o chamado',
  atualizou_chamado: 'Atualizou o chamado',
  reabriu_chamado: 'Reabriu o chamado',
  transferiu: 'Transferiu para um analista',
  recusou_fora_de_escopo: 'Identificou assunto fora de TI',
  tentou_novamente: 'Tentou de novo o sistema de chamados',
  aplicou_regra: 'Aplicou uma regra',
};

/** Motivos da transferência, escritos para quem vai atender (o analista). */
export const ANALYST_REASON_LABEL: Record<TransferReason, string> = {
  pedido_do_funcionario: 'O funcionário pediu para falar com uma pessoa.',
  caso_critico: 'Caso crítico: algo parado para a equipe ou para a empresa.',
  chamado_vencido: 'O chamado está com o prazo vencido.',
  baixa_confianca: 'O agent não teve segurança para decidir sozinho.',
  erro_no_sistema: 'O sistema de chamados ficou instável durante o atendimento.',
};
