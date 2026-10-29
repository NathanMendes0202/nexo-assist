import type { OutcomeKind } from '../domain/conversation';

export function fallbackText(kind: OutcomeKind, facts: Record<string, unknown>, question: string | null): string {
  switch (kind) {
    case 'saudacao':
      return 'Oi! Eu sou o Nexo Assist. Posso tirar dúvidas, consultar seus chamados ou abrir um novo. Como posso ajudar?';
    case 'duvida_respondida':
      return 'Encontrei na central de ajuda um artigo que pode resolver. Dá uma olhada e me diz se funcionou.';
    case 'duvida_sem_artigo':
      return 'Não encontrei nada na central de ajuda sobre isso. Posso abrir um chamado para você ou chamar um analista.';
    case 'chamados_listados':
      return 'Esses são os seus chamados. Qual deles você quer ver?';
    case 'chamado_detalhado':
      return 'Aqui está a situação do chamado.';
    case 'chamado_nao_encontrado':
      return 'Não encontrei esse chamado entre os seus. Quer que eu mostre os que estão abertos?';
    case 'pedindo_informacao':
      return question ?? 'Pode me contar um pouco mais sobre o que está acontecendo?';
    case 'rascunho_proposto':
      return 'Montei este rascunho. Confere se está tudo certo e me confirma para eu abrir.';
    case 'atualizacao_proposta':
      return 'Já existe um chamado sobre isso, então prefiro atualizá-lo em vez de abrir outro. Confirma a atualização abaixo?';
    case 'chamado_criado':
      return `Pronto, abri o chamado${facts.ticketId ? ` ${String(facts.ticketId)}` : ''}.`;
    case 'chamado_atualizado':
      return 'Atualizei o chamado com a nova informação.';
    case 'chamado_reaberto':
      return 'Reabri o chamado com a nova informação.';
    case 'nao_pode_reabrir':
      return 'Esse chamado foi resolvido há mais de 7 dias e não dá mais para reabrir. Posso abrir um novo para você.';
    case 'confirmacao_negada':
      return 'Tudo bem, não fiz nada. Quer ajustar alguma coisa ou prefere falar com um analista?';
    case 'nada_a_confirmar':
      return 'Não tenho nada aguardando confirmação. Me conta o que você precisa?';
    case 'transferido':
      return 'Vou passar esta conversa para um analista, com um resumo do que conversamos. A partir de agora eu paro de responder até ele assumir.';
    case 'fora_de_escopo':
      return 'Esse assunto não é de TI, então não consigo ajudar por aqui. Vale procurar a área responsável (RH, Financeiro ou Facilities).';
    case 'sistema_indisponivel':
      return 'O sistema de chamados está instável agora. Tenta de novo em alguns segundos, ou posso chamar um analista.';
    case 'conversa_geral':
      return question ?? 'Não tenho certeza do que você precisa. Quer tirar uma dúvida, abrir um chamado ou ver os seus chamados?';
    case 'erro_interno':
      return 'Tive um problema aqui do meu lado. Pode tentar de novo? Se preferir, chamo um analista.';
  }
}
