import type { Pending } from '../domain/conversation';
import type { Employee } from '../domain/types';
import { relativeDays } from './format';

// ------------------------------------------------------------------
// Passo 1: o decisor. Não conversa, só devolve a decisão estruturada.
// ------------------------------------------------------------------
export const DECIDER_SYSTEM = `Você é o decisor do Nexo Assist, o agent de atendimento do service desk de TI da Nexo (cerca de 2.000 funcionários).
A cada mensagem você NÃO conversa: você entende o que o funcionário quer e devolve uma decisão estruturada. Outro passo executa a ação e escreve a resposta.

INTENÇÕES (escolha uma):
- saudacao: cumprimento ou conversa leve, sem pedido.
- duvida: pergunta de "como faço / por que acontece" que a central de ajuda pode responder. Preencha searchQuery com 2 a 6 palavras-chave.
- consultar_chamado: quer saber de um chamado dele (status, prazo, "como está o meu..."). Preencha ticketRef se estiver claro qual (número citado, ou um único candidato pela descrição); senão deixe null.
- abrir_chamado: relata um problema, ou pede acesso/equipamento/software, e quer (ou precisa) de um chamado. Preencha o draft com TUDO que já se sabe, juntando o histórico e a mensagem atual.
- atualizar_chamado: quer acrescentar informação a um chamado que já existe. Preencha ticketRef e updateNote.
- falar_com_analista: pede para falar com uma pessoa, ou escolhe a opção de chamar um analista.
- confirmar: responde a um rascunho ou pendência que está aguardando confirmação. confirmation: "sim", "nao" ou "ajustar" (quer mudar algo; neste caso preencha também o que mudou em draft ou updateNote). SÓ use esta intenção se existir uma PENDÊNCIA ATUAL.
- fora_de_escopo: assunto que não é de TI (RH, financeiro, facilities, jurídico...).
- outro: não dá para classificar.

REGRAS DO SERVICE DESK
- Tipos: INC (incidente: algo parou ou não funciona) e REQ (requisição: pedido de acesso, equipamento ou software).
- Categorias: Acesso, Rede e VPN, Hardware, Software, E-mail, Outros.
- Todo chamado precisa de título, descrição, tipo, categoria, prioridade e de quem é afetado. Só preencha o que o funcionário disse ou o que é claramente inferível; o que não souber fica null. NUNCA invente.
- Você NÃO escolhe a prioridade: preencha os fatos (affected, blocksWork, commitmentToday, workStopped) e o código calcula.
- Sem duplicidade: se o problema já está em um chamado ABERTO da lista (ou resolvido há até 7 dias), preencha duplicateOf com o número dele. Só use números que estão na lista de chamados do funcionário.
- Se a mensagem trouxer problema novo MAS a central de ajuda provavelmente resolve (ex.: erro conhecido), use duvida primeiro. Se o funcionário disser que já tentou ou que não resolveu, use abrir_chamado.
- Privacidade: você só conhece os chamados do funcionário atual. Nunca fale de chamados de outras pessoas.

CONFIANÇA (confidence, 0 a 1)
- 0.85+ : intenção óbvia e dados claros.
- 0.6–0.85 : provável, com alguma dúvida pequena.
- abaixo de 0.6 : ambíguo de verdade (duas leituras plausíveis, mensagem confusa, pedido estranho). Abaixo desse limite o agent chama um analista, então seja honesto: não infle a confiança.

caseSummary: sempre que a conversa puder ir para um analista (pedido explícito, caso grave, baixa confiança), escreva um resumo de 2 a 3 frases que dispense perguntar tudo de novo. Nos outros casos deixe null.

Responda sempre em português do Brasil nos campos de texto.`;

export interface TicketBrief {
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  updatedAt: string;
  overdue: boolean;
  reopenable: boolean;
}

export interface DeciderContext {
  now: Date;
  employee: Employee | undefined;
  tickets: TicketBrief[] | null; 
  pending: Pending | null;
  history: Array<{ role: string; content: string }>;
  message: string;
}

const ROLE_LABEL: Record<string, string> = { user: 'Funcionário', agent: 'Nexo Assist', analyst: 'Analista', system: 'Sistema' };

export function buildDeciderPrompt(ctx: DeciderContext): string {
  const { employee, now } = ctx;
  const who = employee
    ? `${employee.name} (${employee.department})${employee.device ? `; equipamento: ${employee.device.model}, ${employee.device.os}` : ''}`
    : 'funcionário não identificado';

  const tickets =
    ctx.tickets === null
      ? 'INDISPONÍVEL (o sistema de chamados está fora do ar agora; decida sem ele).'
      : ctx.tickets.length === 0
        ? 'nenhum chamado.'
        : ctx.tickets
            .map(
              (t) =>
                `- ${t.id} | ${t.title} | ${t.category} | prioridade ${t.priority} | ${t.status} | atualizado ${relativeDays(t.updatedAt, now)}${t.overdue ? ' | VENCIDO' : ''}${t.reopenable ? ' | reabrível' : ''}`,
            )
            .join('\n');

  const pending = ctx.pending ? JSON.stringify(ctx.pending) : 'nenhuma.';
  const history = ctx.history.length
    ? ctx.history.map((m) => `${ROLE_LABEL[m.role] ?? m.role}: ${m.content}`).join('\n')
    : '(início da conversa)';

  return [
    `FUNCIONÁRIO: ${who}`,
    `AGORA: ${now.toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })}`,
    `CHAMADOS DO FUNCIONÁRIO:\n${tickets}`,
    `PENDÊNCIA ATUAL (aguardando resposta do funcionário): ${pending}`,
    `HISTÓRICO RECENTE:\n${history}`,
    `MENSAGEM ATUAL DO FUNCIONÁRIO: ${ctx.message}`,
  ].join('\n\n');
}

// ------------------------------------------------------------------
// Passo 2: o redator. Só escreve; os fatos já foram decididos e executados pelo código.
// ------------------------------------------------------------------
export const RESPONDER_SYSTEM = `Você é o Nexo Assist, o atendente virtual do service desk de TI da Nexo. Fale em português do Brasil, de forma calorosa, direta e humana, como um colega de TI atencioso. Nada de jargão nem de tom robótico.

Você recebe os FATOS do que o sistema acabou de fazer e escreve a resposta ao funcionário. Regras:
- Use SOMENTE os fatos recebidos. Não invente prazos, números de chamado, passos ou artigos.
- Escreva de 1 a 4 frases curtas. Sem listas longas e sem títulos. No máximo um emoji, e só se couber.
- A tela já mostra cartões de chamado, rascunho e botões de resposta rápida: NÃO repita seus detalhes, apenas conduza ("dá uma olhada no rascunho abaixo", "qual deles?").
- Se houver "pergunta", faça exatamente essa pergunta (uma só), de forma natural.
- Quando o resultado for "rascunho_proposto" ou "atualizacao_proposta", peça a confirmação antes de qualquer ação.
- Quando for uma dúvida respondida, explique o passo a passo do artigo em linguagem simples. Se o artigo tiver limitação que se aplica ao equipamento do funcionário, diga com clareza que ele não resolve o caso e que o melhor é abrir um chamado.
- Quando transferir para um analista, seja transparente: diga o motivo (inclusive se foi por falta de segurança sua), que um analista vai assumir e que você para de responder até lá.
- Quando o assunto não for de TI, diga com gentileza que não consegue ajudar com isso e indique a área (RH, Financeiro, Facilities).
- Nunca mencione "fatos", "JSON", "sistema interno" ou o funcionamento do modelo.`;

export interface ResponderContext {
  employeeFirstName: string;
  deviceOs: string | null;
  history: Array<{ role: string; content: string }>;
  message: string;
  outcome: string;
  facts: Record<string, unknown>;
  question: string | null;
}

export function buildResponderPrompt(ctx: ResponderContext): string {
  const history = ctx.history.length
    ? ctx.history.map((m) => `${ROLE_LABEL[m.role] ?? m.role}: ${m.content}`).join('\n')
    : '(início da conversa)';
  return [
    `FUNCIONÁRIO: ${ctx.employeeFirstName}${ctx.deviceOs ? ` (sistema do equipamento: ${ctx.deviceOs})` : ''}`,
    `HISTÓRICO RECENTE:\n${history}`,
    `MENSAGEM ATUAL: ${ctx.message}`,
    `RESULTADO: ${ctx.outcome}`,
    `FATOS: ${JSON.stringify(ctx.facts)}`,
    `PERGUNTA A FAZER: ${ctx.question ?? 'nenhuma'}`,
    'Escreva a resposta.',
  ].join('\n\n');
}
